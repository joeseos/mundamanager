'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchLiveBattle,
  setLiveBattleScenario,
  setLiveBattleScenarioParts,
  advanceRound,
  changeLiveBattlePhase,
  cancelLiveBattle,
} from '@/app/actions/live-battles';
import { useLiveBattleRealtime } from '@/hooks/use-live-battle-realtime';
import ParticipantCard from './participant-card';
import CompletedLiveBattle from './completed-live-battle';
import Modal from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { liveBattleScenarioLabel, type LiveBattleFull } from '@/types/live-battle';
import type { Scenario, ScenarioTableWithEntries } from '@/types/campaign';
import type { ScenarioPartEdit } from '@/utils/scenario-parts';
import { sameEditionForDisplay, hasCrewRating, hasScenarioTables } from '@/types/edition';
import { ScenarioPartsPicker } from '@/components/scenario-parts-picker';
import type { GangFighter } from '@/types/gang';

const CreateBattleModal = dynamic(() => import('./create-battle-modal'), { ssr: false });
const CompleteBattleModal = dynamic(() => import('./complete-battle-modal'), { ssr: false });

interface ActiveLiveBattleProps {
  liveBattle: LiveBattleFull;
  userId: string;
  isArbitrator?: boolean;
  scenarios: Scenario[];
  gangFightersMap: Record<string, GangFighter[]>;
  gangPositioningMap: Record<string, Record<string, any> | null>;
  territories?: { id: string; name: string; controlled_by?: string; default_gang_territory?: boolean }[];
  /** The scenario tables of the live battle's edition: an N26 battle is made from them. */
  scenarioTables?: ScenarioTableWithEntries[];
}

export default function ActiveLiveBattle({
  liveBattle: initialLiveBattle,
  userId,
  isArbitrator = false,
  scenarios,
  gangFightersMap,
  gangPositioningMap,
  territories = [],
  scenarioTables = [],
}: ActiveLiveBattleProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: liveBattle = initialLiveBattle } = useQuery({
    queryKey: ['live-battle', initialLiveBattle.id],
    queryFn: async () => {
      const data = await fetchLiveBattle(initialLiveBattle.id);
      if (!data) throw new Error('Live battle not found');
      return data;
    },
    initialData: initialLiveBattle,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const { broadcast, suppressRefetch } = useLiveBattleRealtime(liveBattle.id);

  const editionScenarios = useMemo(
    () => scenarios.filter((s) => sameEditionForDisplay(s.edition_slug, liveBattle.edition_slug)),
    [scenarios, liveBattle.edition_slug]
  );

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [showRoundModal, setShowRoundModal] = useState(false);
  const [showRevertRoundModal, setShowRevertRoundModal] = useState(false);
  const [showReturnToSetupModal, setShowReturnToSetupModal] = useState(false);
  const [showCompleteBattleModal, setShowCompleteBattleModal] = useState(false);

  const scenarioMutation = useMutation({
    mutationFn: (scenario: string) =>
      setLiveBattleScenario(liveBattle.id, scenario),
    onSuccess: () => {
      broadcast();
      queryClient.invalidateQueries({ queryKey: ['live-battle', liveBattle.id] });
    },
    onError: () => toast.error('Failed to update scenario'),
  });

  // N26: Deployment, Objective and Crew instead of a scenario.
  const usesScenarioTables = hasScenarioTables(liveBattle.edition_slug);
  const scenarioPartMutation = useMutation({
    mutationFn: async (edit: ScenarioPartEdit) => {
      const result = await setLiveBattleScenarioParts(liveBattle.id, edit);
      if (!result.success) throw new Error(result.error);
    },
    onSuccess: () => {
      broadcast();
      queryClient.invalidateQueries({ queryKey: ['live-battle', liveBattle.id] });
    },
    onError: (error) => toast.error(error.message || 'Failed to update scenario'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelLiveBattle(liveBattle.id),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.removeQueries({ queryKey: ['live-battle', liveBattle.id] });
        setShowCancelModal(false);
        toast.success('Battle cancelled');
        broadcast();
        const ownGangId = liveBattle.participants.find(p => p.user_id === userId)?.gang_id;
        router.push(
          ownGangId
            ? `/gang/${ownGangId}`
            : liveBattle.campaign_id
              ? `/campaigns/${liveBattle.campaign_id}`
              : '/'
        );
      } else {
        toast.error(result.error);
      }
    },
    onError: () => toast.error('Failed to cancel'),
  });

  const roundMutation = useMutation({
    mutationFn: () => advanceRound(liveBattle.id),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Round ${result.newRound} started`);
        broadcast();
        queryClient.invalidateQueries({ queryKey: ['live-battle', liveBattle.id] });
      } else {
        toast.error(result.error || 'Failed to advance round');
      }
    },
    onError: () => toast.error('Failed to advance round'),
  });

  const revertRoundMutation = useMutation({
    mutationFn: () => advanceRound(liveBattle.id, 'back'),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Reverted to round ${result.newRound}`);
        broadcast();
        queryClient.invalidateQueries({ queryKey: ['live-battle', liveBattle.id] });
      } else {
        toast.error(result.error || 'Failed to revert round');
      }
    },
    onError: () => toast.error('Failed to revert round'),
  });

  const changePhaseMutation = useMutation({
    mutationFn: (direction: 'forward' | 'back') => changeLiveBattlePhase(liveBattle.id, direction),
    onSuccess: (result) => {
      if (result.success) {
        broadcast();
        queryClient.invalidateQueries({ queryKey: ['live-battle', liveBattle.id] });
      } else {
        toast.error(result.error || 'Failed to change phase');
      }
    },
    onError: () => toast.error('Failed to change phase'),
  });

  if (liveBattle.status === 'completed') {
    return <CompletedLiveBattle liveBattle={liveBattle} userId={userId} />;
  }

  const isOwner = liveBattle.created_by === userId;
  const canManage = isOwner || isArbitrator;
  const isPreBattle = liveBattle.status === 'pre_battle';
  const isPostBattle = liveBattle.status === 'post_battle';
  const battleActive = liveBattle.status === 'active';

  const crewRated = hasCrewRating(liveBattle.edition_slug);
  const ratings = liveBattle.participants.map((p) => {
    if (!crewRated) return p.gang?.rating ?? 0;
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

  const userGangInLiveBattle = liveBattle.participants.find((p) => p.user_id === userId);

  return (
    <>
      {/* Header block */}
      <div className="bg-card shadow-md rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">
              {liveBattleScenarioLabel(liveBattle) || 'Live Battle'}
            </h1>
            {liveBattle.campaign_name && (
              <p className="text-sm text-neutral-500">{liveBattle.campaign_name}</p>
            )}
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            {canManage && (
              <>
                {isPreBattle && !liveBattle.campaign_battle_id && (
                  <Button className="flex-1 sm:flex-none" onClick={() => setShowAddPlayerModal(true)}>
                    Add Player
                  </Button>
                )}
                {battleActive && (
                  <Button
                    variant="outline"
                    className="flex-1 sm:flex-none"
                    onClick={() => setShowReturnToSetupModal(true)}
                    disabled={changePhaseMutation.isPending}
                  >
                    Back to Pre-Battle
                  </Button>
                )}
                {isPostBattle && (
                  <Button
                    variant="outline"
                    className="flex-1 sm:flex-none"
                    onClick={() => changePhaseMutation.mutate('back')}
                    disabled={changePhaseMutation.isPending}
                  >
                    Resume Battle
                  </Button>
                )}
              </>
            )}
            {(canManage || userGangInLiveBattle) && (
              <Button
                variant="destructive"
                className="flex-1 sm:flex-none"
                onClick={() => setShowCancelModal(true)}
                disabled={cancelMutation.isPending}
              >
                Cancel Battle
              </Button>
            )}
          </div>
        </div>

        {isPreBattle && (
          <div className="mt-4">
            {usesScenarioTables ? (
              <ScenarioPartsPicker
                scenarioTables={scenarioTables}
                parts={liveBattle}
                onChange={(_change, edit) => scenarioPartMutation.mutate(edit)}
                saveTypedNamesOnBlur
                disabled={!canManage}
              />
            ) : (
              <>
              <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Scenario
              </label>
              <Combobox
                options={editionScenarios.map((s) => ({
                  value: s.id,
                  label: s.scenario_number ? `${s.scenario_number}. ${s.scenario_name}` : s.scenario_name,
                }))}
                value={editionScenarios.find((s) => s.scenario_name === liveBattle.scenario)?.id ?? ''}
                onValueChange={(id) => {
                  const name = editionScenarios.find((s) => s.id === id)?.scenario_name ?? id;
                  scenarioMutation.mutate(name);
                }}
                placeholder="Select scenario..."
              />
              </>
            )}
            {liveBattle.participants.length >= 2 && (() => {
              const readyCount = liveBattle.participants.filter((p) => p.ready).length;
              const total = liveBattle.participants.length;
              const notReady = liveBattle.participants.filter((p) => !p.ready);
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
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="w-full text-sm font-medium text-neutral-700 dark:text-neutral-300 sm:w-auto">
              Round {liveBattle.round}
            </span>
            {liveBattle.round > 1 && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 sm:flex-none"
                onClick={() => setShowRevertRoundModal(true)}
                disabled={revertRoundMutation.isPending}
              >
                Revert Round
              </Button>
            )}
            <Button
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => setShowRoundModal(true)}
              disabled={roundMutation.isPending}
            >
              Complete Round
            </Button>
            {canManage && (
              <Button
                size="sm"
                className="w-full sm:ml-auto sm:w-auto"
                onClick={() => changePhaseMutation.mutate('forward')}
                disabled={changePhaseMutation.isPending}
              >
                End Battle
              </Button>
            )}
          </div>
        )}

        {isPostBattle && (
          <div className="mt-4">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Post-Battle — enter reputation and income, then ready up
            </p>
            {liveBattle.participants.length >= 2 && (() => {
              const readyCount = liveBattle.participants.filter((p) => p.ready).length;
              const total = liveBattle.participants.length;
              const notReady = liveBattle.participants.filter((p) => !p.ready);
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
            {canManage && (
              <div className="mt-2 flex sm:justify-end">
                <Button
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => setShowCompleteBattleModal(true)}
                  disabled={!liveBattle.participants.every((p) => p.ready)}
                >
                  Complete Battle
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Gangs block */}
      <div className="bg-card shadow-md rounded-lg p-4">
        <div className="space-y-4">
          <h2 className="text-xl md:text-2xl font-bold">
            Gangs
            {liveBattle.participants.length >= 2 && (ratingDiff > 0 || !crewRated) && (
              <span className="ml-2 text-sm font-normal text-neutral-500 dark:text-neutral-400">
                (Rating Difference: {ratingDiff})
              </span>
            )}
          </h2>
          {liveBattle.participants.map((participant) => (
            <ParticipantCard
              key={participant.id}
              participant={participant}
              liveBattle={liveBattle}
              userId={userId}
              canManage={canManage}
              isArbitrator={isArbitrator}
              editable={isPreBattle || isPostBattle}
              battleActive={battleActive}
              gangFightersList={gangFightersMap[participant.gang_id] || []}
              positioning={gangPositioningMap[participant.gang_id]}
              scenarioTables={scenarioTables}
              onBroadcast={() => {
                broadcast();
                queryClient.invalidateQueries({ queryKey: ['live-battle', liveBattle.id] });
              }}
            />
          ))}
        </div>
      </div>

      {showCancelModal && createPortal(
        <Modal
          title="Cancel Live Battle"
          onClose={() => setShowCancelModal(false)}
          onConfirm={async () => {
            cancelMutation.mutate();
            return false;
          }}
          confirmText="Delete Live Battle"
          confirmDisabled={cancelMutation.isPending}
        >
          <p>Are you sure you want to cancel this live battle? This will delete all records.</p>
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
          <p>Complete round {liveBattle.round} and start round {liveBattle.round + 1}? All fighters still in play will be reactivated.</p>
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
          confirmDisabled={revertRoundMutation.isPending}
        >
          <p>Go back to round {liveBattle.round - 1}? All fighters still in play will be reactivated.</p>
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
          confirmDisabled={changePhaseMutation.isPending}
        >
          <p>Return to Pre-Battle Sequence? This will unlock crew selection for all players.</p>
        </Modal>,
        document.body
      )}

      {showAddPlayerModal && (userGangInLiveBattle || canManage) && (
        <CreateBattleModal
          gangId={userGangInLiveBattle?.gang_id}
          gangName={userGangInLiveBattle?.gang?.name ?? 'Your Gang'}
          campaignId={liveBattle.campaign_id ?? undefined}
          existingLiveBattleId={liveBattle.id}
          existingGangIds={liveBattle.participants.map((p) => p.gang_id)}
          editionSlug={liveBattle.edition_slug}
          onClose={() => setShowAddPlayerModal(false)}
        />
      )}

      {showCompleteBattleModal && (
        <CompleteBattleModal
          liveBattle={liveBattle}
          gangFightersMap={gangFightersMap}
          territories={territories}
          onClose={() => setShowCompleteBattleModal(false)}
          onSuppressRefetch={suppressRefetch}
          onBroadcast={() => {
            broadcast();
            queryClient.invalidateQueries({ queryKey: ['live-battle', liveBattle.id] });
          }}
        />
      )}
    </>
  );
}
