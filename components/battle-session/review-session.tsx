'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  setSessionWinner,
  confirmBattleResults,
  applyBattleResults,
} from '@/app/actions/battle-sessions';
import ParticipantCard from './participant-card';
import type { BattleSessionFull } from '@/types/battle-session';

interface ReviewSessionProps {
  session: BattleSessionFull;
  userId: string;
}

export default function ReviewSession({
  session,
  userId,
}: ReviewSessionProps) {
  const isOwner = session.created_by === userId;
  const myParticipant = session.participants.find((p) => p.user_id === userId);
  const allConfirmed = session.participants.every((p) => p.confirmed);
  const iConfirmed = myParticipant?.confirmed ?? false;

  const winnerMutation = useMutation({
    mutationFn: (gangId: string | null) =>
      setSessionWinner(session.id, gangId),
    onError: () => toast.error('Failed to set winner'),
  });

  const confirmMutation = useMutation({
    mutationFn: () => confirmBattleResults(session.id),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Results confirmed');
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error('Failed to confirm'),
  });

  const applyMutation = useMutation({
    mutationFn: () => applyBattleResults(session.id),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Battle results applied!');
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error('Failed to apply results'),
  });

  // Total summary
  const totalFighters = session.participants.reduce(
    (sum, p) => sum + p.fighters.length,
    0
  );
  const totalXp = session.participants.reduce(
    (sum, p) => sum + p.fighters.reduce((s, f) => s + f.xp_earned, 0),
    0
  );
  const totalInjuries = session.participants.reduce(
    (sum, p) =>
      sum + p.fighters.reduce((s, f) => s + (f.pending_injuries?.length ?? 0), 0),
    0
  );

  return (
    <div className="bg-card shadow-md rounded-lg p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          Review: {session.scenario || 'Battle Session'}
        </h1>
        {session.campaign_name && (
          <p className="text-sm text-neutral-500">{session.campaign_name}</p>
        )}
      </div>

      {/* Summary */}
      <div className="mb-6 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800">
        <h2 className="mb-2 font-semibold">Summary</h2>
        <div className="flex gap-6 text-sm">
          <span>{session.participants.length} gangs</span>
          <span>{totalFighters} fighters</span>
          <span>{totalXp} total XP</span>
          {totalInjuries > 0 && (
            <span className="text-red-500">{totalInjuries} injuries</span>
          )}
        </div>
      </div>

      {/* Winner Selection */}
      <div className="mb-6">
        <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Winner
        </label>
        <select
          value={session.winner_gang_id || 'draw'}
          onChange={(e) =>
            winnerMutation.mutate(
              e.target.value === 'draw' ? null : e.target.value
            )
          }
          disabled={!isOwner}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800"
        >
          <option value="draw">Draw / No Winner</option>
          {session.participants.map((p) => (
            <option key={p.gang_id} value={p.gang_id}>
              {p.gang?.name || 'Unknown Gang'}
            </option>
          ))}
        </select>
      </div>

      {/* Participants (read-only) */}
      <div className="mb-6 space-y-4">
        {session.participants.map((participant) => (
          <ParticipantCard
            key={participant.id}
            participant={participant}
            session={session}
            userId={userId}
            isOwner={isOwner}
            editable={false}
          />
        ))}
      </div>

      {/* Confirmation Status */}
      <div className="mb-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-700">
        <h3 className="mb-2 font-semibold">Confirmations</h3>
        <div className="space-y-2">
          {session.participants.map((p) => (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <span
                className={
                  p.confirmed
                    ? 'text-green-600'
                    : 'text-neutral-400'
                }
              >
                {p.confirmed ? '✓' : '○'}
              </span>
              <span>
                {p.profile?.username || 'Unknown'} —{' '}
                {p.gang?.name || 'Unknown Gang'}
              </span>
              {p.confirmed && p.confirmed_at && (
                <span className="text-xs text-neutral-400">
                  {new Date(p.confirmed_at).toLocaleTimeString()}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3">
        {!iConfirmed && (
          <button
            onClick={() => confirmMutation.mutate()}
            disabled={confirmMutation.isPending}
            className="rounded-lg bg-neutral-900 px-6 py-3 font-medium text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            Confirm My Results
          </button>
        )}

        {isOwner && allConfirmed && (
          <button
            onClick={() => applyMutation.mutate()}
            disabled={applyMutation.isPending}
            className="rounded-lg bg-green-600 px-6 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {applyMutation.isPending ? 'Applying...' : 'Apply All Results'}
          </button>
        )}
      </div>
    </div>
  );
}
