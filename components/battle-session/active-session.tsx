'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchBattleSession,
  setSessionScenario,
  advanceRound,
  changeSessionPhase,
  cancelBattleSession,
} from '@/app/actions/battle-sessions';
import { useBattleSessionRealtime } from '@/hooks/use-battle-session-realtime';
import ParticipantCard from './participant-card';
import CreateBattleModal from './create-battle-modal';
import CompleteBattleModal from './complete-battle-modal';
import CompletedSession from './completed-session';
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
  territories?: { id: string; name: string; controlled_by?: string; default_gang_territory?: boolean }[];
}

export default function ActiveSession({
  session: initialSession,
  userId,
  scenarios,
  gangFightersMap,
  gangPositioningMap,
  territories = [],
}: ActiveSessionProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session = initialSession } = useQuery({
    queryKey: ['battle-session', initialSession.id],
    queryFn: async () => {
      const data = await fetchBattleSession(initialSession.id);
      if (!data) throw new Error('Session not found');
      return data;
    },
    initialData: initialSession,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const broadcast = useBattleSessionRealtime(session.id);

  if (session.status === 'completed') {
    return <CompletedSession session={session} userId={userId} />;
  }
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showRoundModal, setShowRoundModal] = useState(false);
  const [showRevertRoundModal, setShowRevertRoundModal] = useState(false);
  const [showReturnToSetupModal, setShowReturnToSetupModal] = useState(false);
  const [showCompleteBattleModal, setShowCompleteBattleModal] = useState(false);
  const isOwner = session.created_by === userId;
  const isPreBattle = session.status === 'pre_battle';
  const isPostBattle = session.status === 'post_battle';
  const battleActive = session.status === 'active';

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
    onSuccess: () => broadcast(),
    onError: () => toast.error('Failed to update scenario'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelBattleSession(session.id),
    onSuccess: (result) => {
      if (result.success) {
        toast.success('Battle cancelled');
        broadcast();
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
        broadcast();
        queryClient.invalidateQueries({ queryKey: ['battle-session', session.id] });
      } else {
        toast.error(result.error || 'Failed to advance round');
      }
    },
    onError: () => toast.error('Failed to advance round'),
  });

  const revertRoundMutation = useMutation({
    mutationFn: () => advanceRound(session.id, 'back'),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Reverted to round ${result.newRound}`);
        broadcast();
        queryClient.invalidateQueries({ queryKey: ['battle-session', session.id] });
      } else {
        toast.error(result.error || 'Failed to revert round');
      }
    },
    onError: () => toast.error('Failed to revert round'),
  });

  const changePhaseMutation = useMutation({
    mutationFn: (direction: 'forward' | 'back') => changeSessionPhase(session.id, direction),
    onSuccess: (result) => {
      if (result.success) {
        broadcast();
        queryClient.invalidateQueries({ queryKey: ['battle-session', session.id] });
      } else {
        toast.error(result.error || 'Failed to change phase');
      }
    },
    onError: () => toast.error('Failed to change phase'),
  });

  const userGangInSession = session.participants.find((p) => p.user_id === userId);

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
                {battleActive && (
                  <Button
                    variant="outline"
                    onClick={() => setShowReturnToSetupModal(true)}
                    disabled={changePhaseMutation.isPending}
                  >
                    Back to Pre-Battle
                  </Button>
                )}
                {isPostBattle && (
                  <Button
                    variant="outline"
                    onClick={() => changePhaseMutation.mutate('back')}
                    disabled={changePhaseMutation.isPending}
                  >
                    Resume Battle
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
            {session.participants.length >= 2 && (() => {
              const readyCount = session.participants.filter((p) => p.ready).length;
              const total = session.participants.length;
              const notReady = session.participants.filter((p) => !p.ready);
              return (
                <div className="mt-3 text-sm text-muted-foreground">
                  {readyCount === total ? (
                    <span className="text-green-600 font-medium">All players ready — starting battle...</span>
                  ) : (
                    <span>
                      {readyCount}/{total} ready
                      {notReady.length > 0 && (
                        <span> — Waiting for {notReady.map((p) => p.gang?.name || 'Unknown').join(', ')}</span>
                      )}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {battleActive && (
          <div className="mt-4 flex items-center gap-3">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Round {session.round}
            </span>
            {session.round > 1 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowRevertRoundModal(true)}
                disabled={revertRoundMutation.isPending}
              >
                Revert Round
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => setShowRoundModal(true)}
              disabled={roundMutation.isPending}
            >
              Complete Round
            </Button>
          </div>
        )}

        {isPostBattle && (
          <div className="mt-4">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Post-Battle — enter reputation and income, then ready up
            </p>
            {session.participants.length >= 2 && (() => {
              const readyCount = session.participants.filter((p) => p.ready).length;
              const total = session.participants.length;
              const notReady = session.participants.filter((p) => !p.ready);
              return (
                <div className="mt-2 text-sm text-muted-foreground">
                  {readyCount === total ? (
                    <span className="text-green-600 font-medium">All players ready</span>
                  ) : (
                    <span>
                      {readyCount}/{total} ready
                      {notReady.length > 0 && (
                        <span> — Waiting for {notReady.map((p) => p.gang?.name || 'Unknown').join(', ')}</span>
                      )}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

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
              editable={isPreBattle || isPostBattle}
              battleActive={battleActive}
              gangFightersList={gangFightersMap[participant.gang_id] || []}
              positioning={gangPositioningMap[participant.gang_id]}
              onBroadcast={broadcast}
            />
          ))}
        </div>

        {battleActive && isOwner && (
          <div className="mt-4 flex justify-end gap-2">
            <Button
              onClick={() => changePhaseMutation.mutate('forward')}
              disabled={changePhaseMutation.isPending}
            >
              End Battle
            </Button>
          </div>
        )}

        {isPostBattle && isOwner && (
          <div className="mt-4 flex justify-end gap-2">
            <Button
              onClick={() => setShowCompleteBattleModal(true)}
              disabled={!session.participants.every((p) => p.ready)}
            >
              Complete Battle
            </Button>
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

      {showRevertRoundModal && createPortal(
        <Modal
          title="Revert Round"
          onClose={() => setShowRevertRoundModal(false)}
          onConfirm={async () => {
            revertRoundMutation.mutate();
            setShowRevertRoundModal(false);
            return true;
          }}
          confirmText="Revert Round"
          confirmDisabled={revertRoundMutation.isPending}
        >
          <p>Go back to round {session.round - 1}? All fighters will be reactivated.</p>
        </Modal>,
        document.body
      )}

      {showReturnToSetupModal && createPortal(
        <Modal
          title="Return to Pre-Battle"
          onClose={() => setShowReturnToSetupModal(false)}
          onConfirm={async () => {
            changePhaseMutation.mutate('back');
            setShowReturnToSetupModal(false);
            return true;
          }}
          confirmText="Return to Pre-Battle"
          confirmDisabled={changePhaseMutation.isPending}
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

      {showCompleteBattleModal && (
        <CompleteBattleModal
          session={session}
          gangFightersMap={gangFightersMap}
          territories={territories}
          onClose={() => setShowCompleteBattleModal(false)}
        />
      )}
    </>
  );
}
