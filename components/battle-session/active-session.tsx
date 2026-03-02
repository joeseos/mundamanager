'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  addParticipant,
  inviteToSession,
  setSessionScenario,
  moveToReview,
  cancelBattleSession,
} from '@/app/actions/battle-sessions';
import ParticipantCard from './participant-card';
import Modal from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import type { BattleSessionFull } from '@/types/battle-session';
import type { Scenario } from '@/types/campaign';

interface ActiveSessionProps {
  session: BattleSessionFull;
  userId: string;
  userGangs: { id: string; name: string; rating: number }[];
  campaignGangs: { gang_id: string; user_id: string }[];
  scenarios: Scenario[];
  refetch: () => Promise<void>;
}

export default function ActiveSession({
  session,
  userId,
  userGangs,
  campaignGangs,
  scenarios,
  refetch,
}: ActiveSessionProps) {
  const router = useRouter();
  const [selectedGangId, setSelectedGangId] = useState('');
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteSearchResults, setInviteSearchResults] = useState<{ id: string; username: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedInviteUserId, setSelectedInviteUserId] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const isOwner = session.created_by === userId;

  // Gangs already in session
  const participantGangIds = new Set(session.participants.map((p) => p.gang_id));

  // Available gangs to add
  const availableGangs = session.campaign_id
    ? userGangs.filter(
        (g) =>
          !participantGangIds.has(g.id) &&
          campaignGangs.some((cg) => cg.gang_id === g.id)
      )
    : userGangs.filter((g) => !participantGangIds.has(g.id));

  // Rating difference calculation
  const ratings = session.participants.map((p) =>
    (p.fighters ?? []).reduce(
      (sum, f) => sum + (f.fighter?.total_cost ?? f.fighter?.credits ?? 0),
      0
    )
  );
  const maxRating = ratings.length > 0 ? Math.max(...ratings) : 0;
  const minRating = ratings.length > 0 ? Math.min(...ratings) : 0;
  const ratingDiff = ratings.length >= 2 ? maxRating - minRating : 0;

  useEffect(() => {
    if (!inviteUsername.trim() || !showSuggestions) {
      setInviteSearchResults([]);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-users?query=${encodeURIComponent(inviteUsername)}`);
        if (res.ok) setInviteSearchResults(await res.json());
      } catch {
        setInviteSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [inviteUsername, showSuggestions]);

  const scenarioMutation = useMutation({
    mutationFn: (scenario: string) =>
      setSessionScenario(session.id, scenario),
    onError: () => toast.error('Failed to update scenario'),
  });

  const addGangMutation = useMutation({
    mutationFn: () =>
      addParticipant({
        session_id: session.id,
        gang_id: selectedGangId,
        user_id: userId,
      }),
    onSuccess: (result) => {
      if (result.success) {
        setSelectedGangId('');
        refetch();
      } else {
        toast.error(result.error || 'Failed to add gang');
      }
    },
    onError: () => toast.error('Failed to add gang'),
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      inviteToSession({
        session_id: session.id,
        user_id: selectedInviteUserId,
      }),
    onSuccess: (result) => {
      if (result.success) {
        setInviteUsername('');
        setSelectedInviteUserId('');
        toast.success('Invite sent');
      } else {
        toast.error(result.error || 'Failed to invite player');
      }
    },
    onError: () => toast.error('Failed to invite player'),
  });

  const moveToReviewMutation = useMutation({
    mutationFn: () => moveToReview(session.id),
    onSuccess: (result) => {
      if (!result.success) toast.error(result.error);
    },
    onError: () => toast.error('Failed to move to review'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelBattleSession(session.id),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Battle cancelled');
        router.back();
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error('Failed to cancel'),
  });

  return (
    <div className="bg-card shadow-md rounded-lg p-4">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {session.scenario || 'Battle Session'}
          </h1>
          {session.campaign_name && (
            <p className="text-sm text-neutral-500">{session.campaign_name}</p>
          )}
        </div>
        {isOwner && (
          <Button
            variant="destructive"
            onClick={() => setShowCancelModal(true)}
            disabled={cancelMutation.isPending}
          >
            Cancel Battle
          </Button>
        )}
        {showCancelModal && (
          <Modal
            title="Cancel Battle Session"
            onClose={() => setShowCancelModal(false)}
            onConfirm={async () => {
              cancelMutation.mutate();
              return false; // keep modal open until redirect
            }}
            confirmText="Delete Session"
            confirmDisabled={cancelMutation.isPending}
          >
            <p>Are you sure you want to cancel this battle session? This will delete all records.</p>
          </Modal>
        )}
      </div>

      {/* Add Gang */}
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Add Gang
        </h3>

        {/* Add own gang */}
        {availableGangs.length > 0 && (
          <div className="mb-3 flex gap-2">
            <Combobox
              className="flex-1"
              options={availableGangs.map((g) => ({
                value: g.id,
                label: `${g.name} (Rating: ${g.rating})`,
              }))}
              value={selectedGangId}
              onValueChange={setSelectedGangId}
              placeholder="Select your gang..."
            />
            <Button
              onClick={() => addGangMutation.mutate()}
              disabled={!selectedGangId || addGangMutation.isPending}
              className="w-20"
            >
              Add
            </Button>
          </div>
        )}

        {/* Invite by username (standalone, owner only) */}
        {!session.campaign_id && isOwner && (
          <div className="flex gap-2">
            <div className="relative flex-1 space-y-2">
              <div className="relative">
                <input
                  type="text"
                  value={inviteUsername}
                  onChange={(e) => {
                    setInviteUsername(e.target.value);
                    setShowSuggestions(true);
                    setSelectedInviteUserId('');
                  }}
                  placeholder="Invite player by username..."
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
                />
                {isSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
                  </div>
                )}
                {showSuggestions && inviteSearchResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border bg-card shadow-lg">
                    <ul className="py-2">
                      {inviteSearchResults.map((profile) => (
                        <li key={profile.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setInviteUsername(profile.username);
                              setSelectedInviteUserId(profile.id);
                              setShowSuggestions(false);
                              setInviteSearchResults([]);
                            }}
                            className="w-full px-4 py-2 text-left text-sm hover:bg-muted"
                          >
                            {profile.username}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            <Button
              onClick={() => inviteMutation.mutate()}
              disabled={!selectedInviteUserId || inviteMutation.isPending}
              className="w-20"
            >
              Invite
            </Button>
          </div>
        )}
      </div>

      {/* Scenario Selector */}
      <div className="mb-6">
        <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Scenario
        </label>
        <Combobox
          options={scenarios.map((s) => ({
            value: s.id,
            label: s.scenario_number ? `${s.scenario_number}. ${s.scenario_name}` : s.scenario_name,
          }))}
          value={scenarios.find((s) => s.scenario_name === session.scenario)?.id ?? ''}
          onValueChange={(id) => {
            const name = scenarios.find((s) => s.id === id)?.scenario_name ?? id;
            scenarioMutation.mutate(name);
          }}
          placeholder="Select scenario..."
        />
      </div>

      {/* Participants */}
      <div className="mb-6 space-y-4">
        <h2 className="text-xl md:text-2xl font-bold">
          Gangs
          {session.participants.length >= 2 && ratingDiff > 0 && (
            <span className="ml-2 text-base font-normal text-neutral-500 dark:text-neutral-400">
              ({ratingDiff} rating difference)
            </span>
          )}
        </h2>
        {session.participants.map((participant) => (
          <ParticipantCard
            key={participant.id}
            participant={participant}
            session={session}
            userId={userId}
            isOwner={isOwner}
            editable
            refetch={refetch}
          />
        ))}
      </div>

      {/* Move to Review */}
      {isOwner && session.participants.length >= 2 && (
        <div className="flex justify-end">
          <Button
            onClick={() => moveToReviewMutation.mutate()}
            disabled={moveToReviewMutation.isPending}
          >
            Move to Review
          </Button>
        </div>
      )}
    </div>
  );
}
