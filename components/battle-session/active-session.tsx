'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  addParticipant,
  setSessionScenario,
  advanceRound,
  startBattle,
  returnToSetup,
  completeBattleSession,
  cancelBattleSession,
} from '@/app/actions/battle-sessions';
import ParticipantCard from './participant-card';
import CreateBattleModal from './create-battle-modal';
import Modal from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import type { BattleSessionFull } from '@/types/battle-session';
import type { Scenario } from '@/types/campaign';
import type { GangFighter } from '@/app/lib/shared/gang-data';

interface ActiveSessionProps {
  session: BattleSessionFull;
  userId: string;
  scenarios: Scenario[];
  gangFightersMap: Record<string, GangFighter[]>;
  gangPositioningMap: Record<string, Record<string, any> | null>;
}

export default function ActiveSession({
  session,
  userId,
  scenarios,
  gangFightersMap,
  gangPositioningMap,
}: ActiveSessionProps) {
  const router = useRouter();
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showRoundModal, setShowRoundModal] = useState(false);
  const [showStartBattleModal, setShowStartBattleModal] = useState(false);
  const [showReturnToSetupModal, setShowReturnToSetupModal] = useState(false);
  const isOwner = session.created_by === userId;
  const isPreBattle = session.status === 'pre_battle';

  const ratings = session.participants.map((p) => {
    const gfList = gangFightersMap[p.gang_id] || [];
    return (p.fighters ?? []).reduce((sum, f) => {
      const match = gfList.find(
        (gf) => gf.id === f.fighter_id && gf.active_loadout_id === (f.loadout_id ?? undefined)
      ) ?? gfList.find((gf) => gf.id === f.fighter_id);
      return sum + (match ? (match.loadout_cost ?? match.credits) : (f.fighter?.credits ?? 0));
    }, 0);
  });
  const maxRating = ratings.length > 0 ? Math.max(...ratings) : 0;
  const minRating = ratings.length > 0 ? Math.min(...ratings) : 0;
  const ratingDiff = ratings.length >= 2 ? maxRating - minRating : 0;

  const scenarioMutation = useMutation({
    mutationFn: (scenario: string) =>
      setSessionScenario(session.id, scenario),
    onError: () => toast.error('Failed to update scenario'),
  });

  const completeMutation = useMutation({
    mutationFn: () => completeBattleSession(session.id),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Battle session completed');
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to complete session');
      }
    },
    onError: () => toast.error('Failed to complete session'),
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

  const roundMutation = useMutation({
    mutationFn: () => advanceRound(session.id),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Round ${result.newRound} started`);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to advance round');
      }
    },
    onError: () => toast.error('Failed to advance round'),
  });

  const startBattleMutation = useMutation({
    mutationFn: () => startBattle(session.id),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Battle started');
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to start battle');
      }
    },
    onError: () => toast.error('Failed to start battle'),
  });

  const returnToSetupMutation = useMutation({
    mutationFn: () => returnToSetup(session.id),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Returned to pre-battle');
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to return to pre-battle');
      }
    },
    onError: () => toast.error('Failed to return to pre-battle'),
  });

  // Join battle — shown when the user has no gang in the session
  const userGangInSession = session.participants.find((p) => p.user_id === userId);
  const hasNoGangInSession = !userGangInSession;
  const [selectedJoinGangId, setSelectedJoinGangId] = useState('');

  const participantGangIds = new Set(session.participants.map((p) => p.gang_id));

  const { data: userGangsData } = useQuery({
    queryKey: ['user-gangs-for-join', userId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}`);
      if (!res.ok) return { gangs: [] };
      const data = await res.json();
      return { gangs: (data.gangs || []) as { id: string; name: string; rating: number }[] };
    },
    enabled: hasNoGangInSession,
  });

  const availableJoinGangs = (userGangsData?.gangs ?? []).filter(
    (g) => !participantGangIds.has(g.id)
  );

  const joinMutation = useMutation({
    mutationFn: () =>
      addParticipant({
        session_id: session.id,
        gang_id: selectedJoinGangId,
        user_id: userId,
      }),
    onSuccess: (result) => {
      if (result.success) {
        setSelectedJoinGangId('');
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to join');
      }
    },
    onError: () => toast.error('Failed to join battle'),
  });

  return (
    <>
      {/* Header block */}
      <div className="bg-card shadow-md rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {session.scenario || 'Battle Session'}
            </h1>
            {session.campaign_name && (
              <p className="text-sm text-neutral-500">{session.campaign_name}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isOwner && (
              <>
                {isPreBattle && (
                  <Button onClick={() => setShowAddPlayerModal(true)}>
                    Add Player
                  </Button>
                )}
                {!isPreBattle && (
                  <Button
                    variant="outline"
                    onClick={() => setShowReturnToSetupModal(true)}
                    disabled={returnToSetupMutation.isPending}
                  >
                    Back to Pre-Battle
                  </Button>
                )}
                <Button
                  variant="destructive"
                  onClick={() => setShowCancelModal(true)}
                  disabled={cancelMutation.isPending}
                >
                  Cancel Battle
                </Button>
              </>
            )}
          </div>
        </div>

        {isPreBattle && (
          <div className="mt-4">
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
        )}

        {!isPreBattle && (
          <div className="mt-4 flex items-center gap-3">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Round {session.round}
            </span>
            {isOwner && (
              <Button
                size="sm"
                onClick={() => setShowRoundModal(true)}
                disabled={roundMutation.isPending}
              >
                {roundMutation.isPending ? 'Advancing...' : 'Complete Round'}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Join battle block — shown when the user has no gang in the session (setup only) */}
      {isPreBattle && hasNoGangInSession && availableJoinGangs.length > 0 && (
        <div className="bg-card shadow-md rounded-lg p-4">
          <h3 className="mb-3 text-lg font-bold">Join Battle</h3>
          <p className="mb-3 text-sm text-neutral-500">
            You&apos;ve been invited to this battle. Select a gang to join.
          </p>
          <div className="flex gap-2">
            <Combobox
              className="flex-1"
              options={availableJoinGangs.map((g) => ({
                value: g.id,
                label: `${g.name} (Rating: ${g.rating})`,
              }))}
              value={selectedJoinGangId}
              onValueChange={setSelectedJoinGangId}
              placeholder="Select your gang..."
            />
            <Button
              onClick={() => joinMutation.mutate()}
              disabled={!selectedJoinGangId || joinMutation.isPending}
            >
              Join
            </Button>
          </div>
        </div>
      )}

      {/* Gangs block */}
      <div className="bg-card shadow-md rounded-lg p-4">
        <div className="space-y-4">
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
              editable={isPreBattle}
              battleActive={!isPreBattle}
              gangFightersList={gangFightersMap[participant.gang_id] || []}
              positioning={gangPositioningMap[participant.gang_id]}
            />
          ))}
        </div>

        {isOwner && session.participants.length >= 2 && (
          <div className="mt-4 flex justify-end gap-2">
            {isPreBattle ? (
              <Button
                onClick={() => setShowStartBattleModal(true)}
                disabled={startBattleMutation.isPending}
              >
                {startBattleMutation.isPending ? 'Starting...' : 'Start Battle'}
              </Button>
            ) : (
              <Button
                onClick={() => completeMutation.mutate()}
                disabled={completeMutation.isPending}
              >
                Complete Battle
              </Button>
            )}
          </div>
        )}
      </div>

      {showCancelModal && createPortal(
        <Modal
          title="Cancel Battle Session"
          onClose={() => setShowCancelModal(false)}
          onConfirm={async () => {
            cancelMutation.mutate();
            return false;
          }}
          confirmText="Delete Session"
          confirmDisabled={cancelMutation.isPending}
        >
          <p>Are you sure you want to cancel this battle session? This will delete all records.</p>
        </Modal>,
        document.body
      )}

      {showRoundModal && createPortal(
        <Modal
          title="Complete Round"
          onClose={() => setShowRoundModal(false)}
          onConfirm={async () => {
            roundMutation.mutate();
            setShowRoundModal(false);
            return true;
          }}
          confirmText="Complete Round"
          confirmDisabled={roundMutation.isPending}
        >
          <p>Complete round {session.round} and start round {session.round + 1}? All fighters will be reactivated.</p>
        </Modal>,
        document.body
      )}

      {showStartBattleModal && createPortal(
        <Modal
          title="Start Battle"
          onClose={() => setShowStartBattleModal(false)}
          onConfirm={async () => {
            startBattleMutation.mutate();
            setShowStartBattleModal(false);
            return true;
          }}
          confirmText="Confirm"
          confirmDisabled={startBattleMutation.isPending}
        >
          <p>Start the battle? Crew selection will be locked until you return to pre-battle.</p>
        </Modal>,
        document.body
      )}

      {showReturnToSetupModal && createPortal(
        <Modal
          title="Return to Pre-Battle"
          onClose={() => setShowReturnToSetupModal(false)}
          onConfirm={async () => {
            returnToSetupMutation.mutate();
            setShowReturnToSetupModal(false);
            return true;
          }}
          confirmText="Return to Pre-Battle"
          confirmDisabled={returnToSetupMutation.isPending}
        >
          <p>Return to Pre-Battle Sequence? This will unlock crew selection for all players.</p>
        </Modal>,
        document.body
      )}

      {showAddPlayerModal && userGangInSession && (
        <CreateBattleModal
          gangId={userGangInSession.gang_id}
          gangName={userGangInSession.gang?.name ?? 'Your Gang'}
          campaignId={session.campaign_id ?? undefined}
          existingSessionId={session.id}
          onClose={() => setShowAddPlayerModal(false)}
        />
      )}
    </>
  );
}
