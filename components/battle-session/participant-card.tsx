'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { sortParticipantFightersByPositioning } from '@/utils/fighter-positioning';

import { useMutation } from '@tanstack/react-query';
import type { GangFighter } from '@/types/gang';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { PatreonSupporterIcon } from '@/components/ui/patreon-supporter-icon';
import { LuTrash2 } from 'react-icons/lu';
import Modal from '@/components/ui/modal';
import { rollNd6Outcome } from '@/utils/dice';
import type { CampaignGangWithFighters } from '@/types/fighter-ooa-record';
import {
  removeParticipant,
  updateParticipantRole,
  updateParticipantSideJob,
  setSideJobCompleted,
  updateGangOutcome,
  updateParticipantResources,
  bulkAddFightersToSession,
  removeFighterFromSession,
  updateFighterLoadout,
  updateSessionXp,
  updateSessionParticipationXp,
  addParticipationXpFighters,
  updateSessionConditions,
  updateActivations,
  updateSessionNote,
  toggleParticipantReady,
} from '@/app/actions/battle-sessions';
import { createGangLog } from '@/app/actions/logs/gang-logs';
import FighterRow from '@/components/battle-session/fighter-row';
import BattleParticipationModal from '@/components/battle-session/battle-participation-modal';
import { applyConditionsUpdate, type BattleSessionFull, type BattleSessionParticipant, type BattleSessionFighter, type SessionCondition } from '@/types/battle-session';
import { beastSubtypeName, hasCrewRating, hasScenarioTables, hasTradePoints } from '@/types/edition';
import type { ScenarioTableWithEntries } from '@/types/campaign';
import { SideJobPicker } from '@/components/side-job-picker';

const CrewSelectionModal = dynamic(() => import('@/components/battle-session/crew-selection-modal'), { ssr: false });

const DUAL_ACTIVATION_RULES = ['Spyre Hunter', 'Aranthian Beauty Plating'];
const hasDualActivation = (rules?: string[] | null) =>
  rules?.some((r) => DUAL_ACTIVATION_RULES.includes(r)) ?? false;

/** Splits session injuries by fighter_types.is_spyrer; a gang can field both. */
export function splitInjuryCounts(
  fighters: BattleSessionFighter[],
  roster: GangFighter[],
): { totalInjuries: number; totalGlitches: number } {
  return fighters.reduce(
    (acc, f) => {
      const count = f.session_record?.injuries?.length ?? 0;
      const isSpyrer = roster.find((gf) => gf.id === f.fighter_id)?.is_spyrer ?? false;
      if (isSpyrer) acc.totalGlitches += count;
      else acc.totalInjuries += count;
      return acc;
    },
    { totalInjuries: 0, totalGlitches: 0 }
  );
}

// ---------------------------------------------------------------------------
// ParticipantCard
// ---------------------------------------------------------------------------

interface ParticipantCardProps {
  participant: BattleSessionParticipant & { fighters: BattleSessionFighter[] };
  session: BattleSessionFull;
  userId: string;
  // Session creator or arbitrator: may manage participants (remove, set roles)
  canManage: boolean;
  // Campaign OWNER/ARBITRATOR (or site admin): may edit any participant's data,
  // unlike the session creator who only manages the session itself
  isArbitrator?: boolean;
  editable?: boolean;
  battleActive?: boolean;
  gangFightersList?: GangFighter[];
  positioning?: Record<string, any> | null;
  onBroadcast?: () => void;
  /** The session edition's scenario tables, for an N26 gang's Side Job. */
  scenarioTables?: ScenarioTableWithEntries[];
}

export default function ParticipantCard({
  participant,
  session,
  userId,
  canManage,
  isArbitrator = false,
  editable = false,
  battleActive = false,
  gangFightersList = [],
  positioning,
  onBroadcast,
  scenarioTables = [],
}: ParticipantCardProps) {
  const [creditsDelta, setCreditsDelta] = useState('');
  const [repDelta, setRepDelta] = useState('');
  const [localCreditsEarned, setLocalCreditsEarned] = useState(participant.credits_earned);
  const [localRepChange, setLocalRepChange] = useState(participant.reputation_change);
  const [resourceDeltas, setResourceDeltas] = useState<Record<string, string>>({});
  const [localResourceChanges, setLocalResourceChanges] = useState(participant.resource_changes ?? []);
  const [localFighters, setLocalFighters] = useState<BattleSessionFighter[]>(participant.fighters);
  const [showCrewModal, setShowCrewModal] = useState(false);
  const [showParticipationModal, setShowParticipationModal] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [tradingPostRoll, setTradingPostRoll] = useState<{ dice: number[]; total: number; modifier: number; grandTotal: number } | null>(null);
  const [tradingPostModifier, setTradingPostModifier] = useState('');
  const [localRole, setLocalRole] = useState<'attacker' | 'defender' | 'none'>(participant.role);
  const savedSideJob = {
    id: participant.side_job_id ?? '',
    name: participant.side_job_name ?? '',
    completed: participant.side_job_completed === true,
  };
  const [localSideJob, setLocalSideJob] = useState(savedSideJob);

  const [readyOverride, setReadyOverride] = useState<boolean | null>(null);
  const readyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (readyTimeoutRef.current) clearTimeout(readyTimeoutRef.current); }, []);
  const [prevReadyProp, setPrevReadyProp] = useState(participant.ready);
  if (prevReadyProp !== participant.ready) {
    setPrevReadyProp(participant.ready);
    if (readyOverride !== null) setReadyOverride(null);
  }
  const localReady = readyOverride ?? participant.ready;
  const isMyGang = participant.user_id === userId;
  const isPostBattle = session.status === 'post_battle';

  // Hatred (X) candidates for injuries added from this session: the gangs
  // actually IN this battle, not every gang in the campaign — only a gang
  // present at the battle can have taken the fighter Out of Action. Already in
  // memory on the session, so no fetch is needed.
  const hatredCandidateGangs = useMemo<CampaignGangWithFighters[]>(
    () =>
      session.participants
        .filter((p) => p.gang_id !== participant.gang_id)
        .map((p) => ({
          gang_id: p.gang_id,
          name: p.gang?.name ?? 'Unknown gang',
          gang_colour: p.gang?.gang_colour ?? null,
          owner_username: p.profile?.username ?? null,
          fighters: p.fighters.flatMap((f) =>
            f.fighter
              ? [{
                  id: f.fighter.id,
                  fighter_name: f.fighter.fighter_name ?? 'Unknown Fighter',
                  fighter_type: f.fighter.fighter_type ?? null,
                  gang_id: p.gang_id,
                }]
              : []
          ),
        })),
    [session.participants, participant.gang_id]
  );
  const canEdit = editable && (isMyGang || isArbitrator) && !isPostBattle;
  const canInteract = battleActive && (isMyGang || isArbitrator);
  const canPostBattle = isPostBattle && (isMyGang || isArbitrator);
  const canEditRole = editable && (canManage || isMyGang) && !isPostBattle;

  const handleRoleChange = (role: 'attacker' | 'defender' | 'none') => {
    setLocalRole(role);
    updateParticipantRole(session.id, participant.id, role).then((result) => {
      if (result.success) {
        onBroadcast?.();
      } else {
        setLocalRole(participant.role);
        toast.error(result.error || 'Failed to update role');
      }
    });
  };

  const handleSideJobChange = (sideJob: typeof savedSideJob, request: Promise<{ success: boolean; error?: string }>) => {
    setLocalSideJob(sideJob);
    request
      .catch(() => ({ success: false, error: undefined }))
      .then((result) => {
        if (result.success) {
          onBroadcast?.();
        } else {
          setLocalSideJob(savedSideJob);
          toast.error(result.error || 'Failed to update Side Job');
        }
      });
  };

  // Map expanded gang fighters (one entry per loadout) to crew modal format
  const gangFighters = useMemo(() => {
    return gangFightersList.map((gf) => ({
      id: gf.id,
      fighter_name: gf.fighter_name,
      label: gf.label,
      fighter_type: gf.fighter_type,
      credits: gf.loadout_cost ?? gf.credits,
      loadout_id: gf.active_loadout_id,
      loadout_name: gf.active_loadout_name,
      killed: gf.killed,
      retired: gf.retired,
      enslaved: gf.enslaved,
      starved: gf.starved,
      recovery: gf.recovery,
      captured: gf.captured,
      fighter_subtypes: gf.fighter_subtypes,
      owner_id: gf.owner_id,
      owner_name: gf.owner_name,
    }));
  }, [gangFightersList]);

  const selectedFighters = new Map<string, string | undefined>(
    localFighters.map((f) => [f.fighter_id, f.loadout_id ?? undefined])
  );

  const sortedLocalFighters = useMemo(() => {
    return sortParticipantFightersByPositioning(localFighters, positioning);
  }, [localFighters, positioning]);

  const { totalInjuries, totalGlitches } = splitInjuryCounts(localFighters, gangFightersList);
  const crewRating = localFighters.reduce((sum, f) => {
    const match = gangFighters.find(
      (gf) => gf.id === f.fighter_id && gf.loadout_id === (f.loadout_id ?? undefined)
    ) ?? gangFighters.find((gf) => gf.id === f.fighter_id);
    return sum + (match?.credits ?? f.fighter?.credits ?? 0);
  }, 0);

  const removeMutation = useMutation({
    mutationFn: () => removeParticipant(session.id, participant.id),
    onSuccess: () => onBroadcast?.(),
    onError: () => toast.error('Failed to remove participant'),
  });

  const gangOutcomeMutation = useMutation({
    mutationFn: (deltaStr: string) => {
      const delta = parseInt(deltaStr) || 0;
      if (delta === 0) return Promise.resolve({ success: true });
      const operation = delta >= 0 ? 'add' as const : 'subtract' as const;
      return updateGangOutcome({
        participant_id: participant.id,
        gang_id: participant.gang_id,
        credits_change: Math.abs(delta),
        credits_operation: operation,
      });
    },
    onMutate: (deltaStr: string) => {
      const prev = localCreditsEarned;
      const delta = parseInt(deltaStr) || 0;
      setLocalCreditsEarned((cur) => cur + delta);
      setCreditsDelta('');
      return { prev };
    },
    onSuccess: () => onBroadcast?.(),
    onError: (_err, _vars, context) => {
      if (context) setLocalCreditsEarned(context.prev);
      toast.error('Failed to update credits');
    },
  });

  const repOutcomeMutation = useMutation({
    mutationFn: (deltaStr: string) => {
      const delta = parseInt(deltaStr) || 0;
      if (delta === 0) return Promise.resolve({ success: true });
      const operation = delta >= 0 ? 'add' as const : 'subtract' as const;
      return updateGangOutcome({
        participant_id: participant.id,
        gang_id: participant.gang_id,
        reputation_change: Math.abs(delta),
        reputation_operation: operation,
      });
    },
    onMutate: (deltaStr: string) => {
      const prev = localRepChange;
      const delta = parseInt(deltaStr) || 0;
      setLocalRepChange((cur) => cur + delta);
      setRepDelta('');
      return { prev };
    },
    onSuccess: () => onBroadcast?.(),
    onError: (_err, _vars, context) => {
      if (context) setLocalRepChange(context.prev);
      toast.error('Failed to update reputation');
    },
  });

  const campaignGangId = session.campaign_gang_ids?.[participant.gang_id];

  const resourceOutcomeMutation = useMutation({
    mutationFn: (params: { resource_id: string; resource_name: string; is_custom: boolean; deltaStr: string }) => {
      const delta = parseInt(params.deltaStr) || 0;
      if (delta === 0 || !campaignGangId) return Promise.resolve({ success: true });
      return updateParticipantResources({
        participant_id: participant.id,
        gang_id: participant.gang_id,
        campaign_gang_id: campaignGangId,
        resource: {
          resource_id: params.resource_id,
          resource_name: params.resource_name,
          is_custom: params.is_custom,
          quantity_delta: delta,
        },
      });
    },
    onMutate: (params) => {
      const delta = parseInt(params.deltaStr) || 0;
      const prev = [...localResourceChanges];
      setLocalResourceChanges((cur) => {
        const updated = [...cur];
        const idx = updated.findIndex((r) => r.resource_id === params.resource_id);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], quantity_delta: updated[idx].quantity_delta + delta };
        } else {
          updated.push({
            resource_id: params.resource_id,
            resource_name: params.resource_name,
            is_custom: params.is_custom,
            quantity_delta: delta,
          });
        }
        return updated;
      });
      setResourceDeltas((cur) => ({ ...cur, [params.resource_id]: '' }));
      return { prev };
    },
    onSuccess: () => onBroadcast?.(),
    onError: (_err, _vars, context) => {
      if (context) setLocalResourceChanges(context.prev);
      toast.error('Failed to update resource');
    },
  });

  const buildOptimisticFighter = (fighterId: string, loadoutId?: string): BattleSessionFighter => {
    const gf = gangFighters.find((f) => f.id === fighterId && (!loadoutId || f.loadout_id === loadoutId))
      ?? gangFighters.find((f) => f.id === fighterId);
    const fullGf = gangFightersList.find((f) => f.id === fighterId);
    const isDual = hasDualActivation(fullGf?.special_rules);
    return {
      id: `temp-${Date.now()}-${fighterId}`,
      battle_session_id: session.id,
      participant_id: participant.id,
      fighter_id: fighterId,
      loadout_id: loadoutId,
      session_record: {
        xp_earned: 0,
        // As bulkAddFightersToSession: a type that can't gain XP starts at 0.
        participation_xp: fullGf?.starting_xp === null ? 0 : 1,
        injuries: [],
        conditions: [],
        activations: isDual ? 2 : 1,
      },
      created_at: new Date().toISOString(),
      fighter: gf ? { id: gf.id, fighter_name: gf.fighter_name, credits: gf.credits, special_rules: fullGf?.special_rules } : undefined,
    };
  };

  const updateXpMutation = useMutation({
    mutationFn: async ({ sessionFighterId, totalXp }: { sessionFighterId: string; totalXp: number }) => {
      const result = await updateSessionXp({ session_fighter_id: sessionFighterId, xp_earned: totalXp });
      if (!result.success) throw new Error(result.error || 'Failed to record XP');
      return result;
    },
    onMutate: ({ sessionFighterId, totalXp }) => {
      const prev = localFighters;
      setLocalFighters((cur) =>
        cur.map((lf) =>
          lf.id === sessionFighterId
            ? { ...lf, session_record: { ...lf.session_record, xp_earned: totalXp } }
            : lf
        )
      );
      return { prev };
    },
    onSuccess: () => onBroadcast?.(),
    onError: (_err, _vars, context) => {
      if (context?.prev) setLocalFighters(context.prev);
      toast.error('Failed to record XP');
    },
  });

  const updateConditionsMutation = useMutation({
    mutationFn: async ({ sessionFighterId, conditions, leftBattlefield }: { sessionFighterId: string; conditions: SessionCondition[]; leftBattlefield?: boolean }) => {
      const result = await updateSessionConditions({ session_fighter_id: sessionFighterId, conditions, left_battlefield: leftBattlefield });
      if (!result.success) throw new Error(result.error || 'Failed to update conditions');
      return result;
    },
    onMutate: ({ sessionFighterId, conditions, leftBattlefield }) => {
      const prev = localFighters;
      setLocalFighters((cur) =>
        cur.map((lf) =>
          lf.id === sessionFighterId
            ? { ...lf, session_record: applyConditionsUpdate(lf.session_record, conditions, leftBattlefield) }
            : lf
        )
      );
      return { prev };
    },
    onSuccess: () => onBroadcast?.(),
    onError: (_err, _vars, context) => {
      if (context?.prev) setLocalFighters(context.prev);
      toast.error('Failed to update conditions');
    },
  });

  const updateActivationsMutation = useMutation({
    mutationFn: async ({ sessionFighterId, activations }: { sessionFighterId: string; activations: number }) => {
      const result = await updateActivations({ session_fighter_id: sessionFighterId, activations });
      if (!result.success) throw new Error(result.error || 'Failed to update activations');
      return result;
    },
    onMutate: ({ sessionFighterId, activations }) => {
      const prev = localFighters;
      setLocalFighters((cur) =>
        cur.map((lf) =>
          lf.id === sessionFighterId
            ? { ...lf, session_record: { ...lf.session_record, activations } }
            : lf
        )
      );
      return { prev };
    },
    onSuccess: () => onBroadcast?.(),
    onError: (_err, _vars, context) => {
      if (context?.prev) setLocalFighters(context.prev);
      toast.error('Failed to update activations');
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ sessionFighterId, note }: { sessionFighterId: string; note: string }) => {
      const result = await updateSessionNote({ session_fighter_id: sessionFighterId, note });
      if (!result.success) throw new Error(result.error || 'Failed to update note');
      return result;
    },
    onMutate: ({ sessionFighterId, note }) => {
      const prev = localFighters;
      setLocalFighters((cur) =>
        cur.map((lf) =>
          lf.id === sessionFighterId
            ? { ...lf, session_record: { ...lf.session_record, note: note || undefined } }
            : lf
        )
      );
      return { prev };
    },
    onSuccess: () => onBroadcast?.(),
    onError: (_err, _vars, context) => {
      if (context?.prev) setLocalFighters(context.prev);
      toast.error('Failed to update note');
    },
  });

  const [prevFighters, setPrevFighters] = useState(participant.fighters);
  if (participant.fighters !== prevFighters) {
    setPrevFighters(participant.fighters);
    setLocalFighters(participant.fighters);
  }

  const [prevCreditsEarned, setPrevCreditsEarned] = useState(participant.credits_earned);
  if (participant.credits_earned !== prevCreditsEarned) {
    setPrevCreditsEarned(participant.credits_earned);
    setLocalCreditsEarned(participant.credits_earned);
  }

  const [prevRepChange, setPrevRepChange] = useState(participant.reputation_change);
  if (participant.reputation_change !== prevRepChange) {
    setPrevRepChange(participant.reputation_change);
    setLocalRepChange(participant.reputation_change);
  }

  const [prevRole, setPrevRole] = useState(participant.role);
  if (participant.role !== prevRole) {
    setPrevRole(participant.role);
    setLocalRole(participant.role);
  }

  const [prevSideJob, setPrevSideJob] = useState(savedSideJob);
  if (
    savedSideJob.id !== prevSideJob.id ||
    savedSideJob.name !== prevSideJob.name ||
    savedSideJob.completed !== prevSideJob.completed
  ) {
    setPrevSideJob(savedSideJob);
    setLocalSideJob(savedSideJob);
  }



  return (
    <div>
      {/* Gang Header */}
      <div className="py-2">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">
                {participant.gang?.name || 'Unknown Gang'}
              </span>
              {localRole !== 'none' && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  localRole === 'attacker'
                    ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                }`}>
                  {localRole === 'attacker' ? 'Attacker' : 'Defender'}
                </span>
              )}
              {editable && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  localReady
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                }`}>
                  {localReady ? 'Ready' : 'Not Ready'}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-neutral-500">
              <span className="flex items-center gap-1">
                Player:
                {participant.profile?.username ? (
                  <Link href={`/user/${participant.user_id}`} prefetch={false}>
                    <Badge variant="outline" className="flex items-center gap-1 hover:bg-accent transition-colors">
                      {participant.profile.patreon_tier_id && (
                        <PatreonSupporterIcon
                          patreonTierId={participant.profile.patreon_tier_id}
                          patreonTierTitle={participant.profile.patreon_tier_title}
                        />
                      )}
                      {participant.profile.username}
                    </Badge>
                  </Link>
                ) : (
                  ' Unknown'
                )}
              </span>
              <span>
                {hasCrewRating(session.edition_slug)
                  ? `Crew Rating: ${crewRating}`
                  : `Gang Rating: ${participant.gang?.rating ?? 0}`}
              </span>
              {(() => {
                const exoticBeastCount = localFighters.filter((f) => {
                  const gf = gangFightersList.find((gf) => gf.id === f.fighter_id);
                  return gf?.fighter_subtypes?.some(c => c.toLowerCase() === 'exotic beast' || c.toLowerCase() === 'exotic beast specialist' || c.toLowerCase() === 'pet') || false;
                }).length;
                const crewCount = localFighters.length - exoticBeastCount;
                return (
                  <span>
                    Crew Size: {crewCount}
                    {exoticBeastCount > 0 && (
                      <span className="text-neutral-400"> (Excluding {exoticBeastCount} {beastSubtypeName(session.edition_slug)}{exoticBeastCount !== 1 ? 's' : ''})</span>
                    )}
                  </span>
                );
              })()}
              {totalInjuries > 0 && (
                <span className="text-red-500">{totalInjuries} {totalInjuries === 1 ? 'Lasting Injury' : 'Lasting Injuries'}</span>
              )}
              {totalGlitches > 0 && (
                <span className="text-red-500">{totalGlitches} {totalGlitches === 1 ? 'Rig Glitch' : 'Rig Glitches'}</span>
              )}
            </div>
          </div>
          {(canEdit || canPostBattle || ((canManage || isMyGang) && editable && !isPostBattle)) && (
            <div className="flex gap-2 self-end sm:self-auto">
              {canPostBattle && localFighters.length > 0 && (
                <Button
                  variant="default"
                  onClick={() => setShowParticipationModal(true)}
                >
                  Participation XP
                </Button>
              )}
              {(canEdit || canPostBattle) && (
                <>
                  <Button
                    variant={localReady ? 'default' : 'success'}
                    onClick={async () => {
                      const prev = localReady;
                      setReadyOverride(!prev);
                      readyTimeoutRef.current = setTimeout(() => setReadyOverride(null), 10000);
                      const result = await toggleParticipantReady(session.id, participant.id);
                      if (!result.success) {
                        if (readyTimeoutRef.current) clearTimeout(readyTimeoutRef.current);
                        setReadyOverride(null);
                        toast.error(result.error || 'Failed to toggle ready');
                      } else {
                        onBroadcast?.();
                      }
                    }}
                    disabled={readyOverride !== null}
                  >
                    {localReady ? 'Unready' : 'Ready'}
                  </Button>
                  {canEdit && (
                    <Button onClick={() => setShowCrewModal(true)}>
                      Select Crew
                    </Button>
                  )}
                </>
              )}
              {(canManage || isMyGang) && editable && !isPostBattle && (
                <Button
                  variant="outline_remove"
                  size="icon"
                  onClick={() => setShowRemoveModal(true)}
                  disabled={removeMutation.isPending}
                  title="Remove gang"
                  aria-label="Remove gang"
                >
                  <LuTrash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
        {canEditRole && (
          <div className="mt-2 flex items-center gap-4">
            {(['attacker', 'defender', 'none'] as const).map((role) => (
              <label key={role} className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name={`role-${participant.id}`}
                  checked={localRole === role}
                  onChange={() => handleRoleChange(role)}
                  className="h-4 w-4 text-foreground focus:ring-black border-border"
                />
                {role === 'attacker' ? 'Attacker' : role === 'defender' ? 'Defender' : 'None'}
              </label>
            ))}
          </div>
        )}
        {hasScenarioTables(session.edition_slug) && (canEditRole || !!localSideJob.id || !!localSideJob.name) && (
          <SideJobPicker
            className="mt-2"
            id={participant.id}
            scenarioTables={scenarioTables}
            gangTypeId={participant.gang?.gang_type_id}
            value={localSideJob.id}
            onChange={canEditRole
              ? (id) => handleSideJobChange({ id, name: '', completed: false }, updateParticipantSideJob(session.id, participant.id, { side_job_id: id || null }))
              : undefined}
            customName={localSideJob.name}
            onCustomNameChange={canEditRole
              ? (name) => handleSideJobChange({ id: '', name, completed: false }, updateParticipantSideJob(session.id, participant.id, { side_job_name: name }))
              : undefined}
            saveCustomNameOnBlur
            completed={localSideJob.completed}
            onCompletedChange={canPostBattle
              ? (completed) => handleSideJobChange({ ...localSideJob, completed }, setSideJobCompleted(session.id, participant.id, completed))
              : undefined}
          />
        )}
        {showRemoveModal && createPortal(
          <Modal
            title="Remove Gang"
            onClose={() => setShowRemoveModal(false)}
            onConfirm={async () => {
              removeMutation.mutate();
              return true;
            }}
            confirmText="Remove Gang"
            confirmDisabled={removeMutation.isPending}
          >
            <p>
              Are you sure you want to remove <strong>{participant.gang?.name ?? 'this gang'}</strong> from this battle?
            </p>
          </Modal>,
          document.body
        )}
        {showCrewModal && (
          <CrewSelectionModal
            gangId={participant.gang_id}
            gangFighters={gangFighters}
            selectedFighters={selectedFighters}
            editionSlug={session.edition_slug}
            loading={false}
            onClose={() => setShowCrewModal(false)}
            onConfirm={async (toAdd, toRemove, toUpdate) => {
              const snapshot = [...localFighters];

              if (toAdd.length > 0) {
                const newFighters = toAdd.map((e) => buildOptimisticFighter(e.fighter_id, e.loadout_id));
                setLocalFighters((cur) => [...cur, ...newFighters]);
              }
              if (toRemove.length > 0) {
                const removeSet = new Set(toRemove);
                setLocalFighters((cur) => cur.filter((f) => !removeSet.has(f.fighter_id)));
              }
              if (toUpdate.length > 0) {
                setLocalFighters((cur) =>
                  cur.map((f) => {
                    const match = toUpdate.find((e) => e.fighter_id === f.fighter_id);
                    return match ? { ...f, loadout_id: match.loadout_id } : f;
                  })
                );
              }

              const results = await Promise.all([
                toAdd.length > 0
                  ? bulkAddFightersToSession({
                      session_id: session.id,
                      participant_id: participant.id,
                      fighter_entries: toAdd,
                    })
                  : { success: true as const, error: undefined },
                ...toRemove.map((id) => removeFighterFromSession(session.id, id, participant.id)),
                ...toUpdate.map((entry) => updateFighterLoadout(session.id, entry.fighter_id, entry.loadout_id, participant.id)),
              ]);

              const failed = results.filter((r) => !r.success);
              if (failed.length > 0) {
                setLocalFighters(snapshot);
                toast.error(failed[0].error || 'Failed to update crew');
                return false;
              }

              toast.success('Crew updated');
              onBroadcast?.();
              return true;
            }}
          />
        )}
        {showParticipationModal && (
          <BattleParticipationModal
            crewFighters={localFighters}
            gangFightersList={gangFightersList}
            editionSlug={session.edition_slug}
            onClose={() => setShowParticipationModal(false)}
            onConfirm={({ crew, added }) => {
              const crewEntries = Object.entries(crew);
              const addedEntries = Object.entries(added);
              const count = crewEntries.length + addedEntries.length;
              if (count === 0) {
                setShowParticipationModal(false);
                return;
              }
              const prev = localFighters;
              setLocalFighters((cur) => [
                ...cur.map((f) =>
                  f.id in crew
                    ? { ...f, session_record: { ...f.session_record, participation_xp: crew[f.id] } }
                    : f
                ),
                ...addedEntries.map(([fighterId, xp]) => {
                  const optimistic = buildOptimisticFighter(fighterId);
                  return { ...optimistic, session_record: { ...optimistic.session_record, participation_xp: xp } };
                }),
              ]);
              const calls: Promise<{ success: boolean }>[] = crewEntries.map(([sessionFighterId, xp]) =>
                updateSessionParticipationXp({ session_fighter_id: sessionFighterId, participation_xp: xp })
              );
              if (addedEntries.length > 0) {
                calls.push(addParticipationXpFighters({
                  session_id: session.id,
                  participant_id: participant.id,
                  fighter_entries: addedEntries.map(([fighter_id, participation_xp]) => ({ fighter_id, participation_xp })),
                }));
              }
              Promise.all(calls).then((results) => {
                if (results.some((r) => !r.success)) {
                  setLocalFighters(prev);
                  toast.error('Failed to update participation XP');
                } else {
                  toast.success(`Participation XP updated for ${count} fighter${count !== 1 ? 's' : ''}`);
                }
                onBroadcast?.();
              });
              setShowParticipationModal(false);
            }}
          />
        )}
      </div>

      <div className="pb-6">
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-xs md:text-sm">
              <thead>
                <tr className="bg-muted border-b">
                  <th className="p-1 md:p-2 text-left font-medium w-full">Fighter</th>
                  {isPostBattle && <th className="p-1 md:p-2 text-right font-medium max-md:whitespace-normal md:whitespace-nowrap">Participation XP</th>}
                  <th className="p-1 md:p-2 text-right font-medium whitespace-nowrap">Value</th>
                  {(canInteract || battleActive) && <th className="p-1 md:p-2 text-right font-medium whitespace-nowrap min-w-[3.6rem]">{canInteract ? 'Actions' : 'Status'}</th>}
                </tr>
              </thead>
              <tbody>
                {localFighters.length === 0 ? (
                  <tr>
                    <td colSpan={2 + (isPostBattle ? 1 : 0) + ((canInteract || battleActive) ? 1 : 0)} className="text-muted-foreground italic text-center py-4">
                      {canEdit ? 'No fighters added yet.' : 'No fighters.'}
                    </td>
                  </tr>
                ) : (
                  sortedLocalFighters.map((f) => {
                    const match = gangFighters.find(
                      (gf) => gf.id === f.fighter_id && gf.loadout_id === (f.loadout_id ?? undefined)
                    ) ?? gangFighters.find((gf) => gf.id === f.fighter_id);
                    const fullMatch = gangFightersList.find(
                      (gf) => gf.id === f.fighter_id && gf.active_loadout_id === (f.loadout_id ?? undefined)
                    ) ?? gangFightersList.find((gf) => gf.id === f.fighter_id);
                    const rawName = match?.fighter_name ?? f.fighter?.fighter_name ?? 'Unknown Fighter';
                    const isAssociatedExoticBeast =
                      fullMatch?.fighter_subtypes?.some(c => c.toLowerCase() === 'exotic beast' || c.toLowerCase() === 'exotic beast specialist' || c.toLowerCase() === 'pet') &&
                      Boolean(fullMatch?.owner_id);
                    const name = isAssociatedExoticBeast ? `— ${rawName}` : rawName;
                    const cost = match?.credits ?? f.fighter?.credits ?? undefined;
                    const xp = f.session_record?.xp_earned ?? 0;
                    const injuryCount = f.session_record?.injuries?.length ?? 0;
                    return (
                      <FighterRow
                        key={f.id}
                        fighter={f}
                        name={name}
                        loadoutName={match?.loadout_name}
                        cost={cost}
                        xp={xp}
                        participationXp={isPostBattle ? (f.session_record?.participation_xp ?? 0) : undefined}
                        injuryCount={injuryCount}
                        canInteract={canInteract}
                        battleActive={battleActive}
                        hasTwoActivations={hasDualActivation(fullMatch?.special_rules) || hasDualActivation(f.fighter?.special_rules)}
                        gangFighter={fullMatch}
                        gangId={participant.gang_id}
                        campaignId={session.campaign_id}
                        // The session's edition, not gangFighter.edition_slug — the
                        // per-fighter slug is often null for custom fighter types.
                        editionSlug={session.edition_slug}
                        candidateGangs={hatredCandidateGangs}
                        isSkirmish={!session.campaign_id}
                        onXpChanged={(delta) => {
                          const totalXp = (f.session_record?.xp_earned ?? 0) + delta;
                          updateXpMutation.mutate({ sessionFighterId: f.id, totalXp });
                        }}
                        onConditionsChanged={(conditions, leftBattlefield) => {
                          updateConditionsMutation.mutate({
                            sessionFighterId: f.id,
                            conditions,
                            leftBattlefield,
                          });
                        }}
                        onActivationsChange={(activations) => {
                          updateActivationsMutation.mutate({
                            sessionFighterId: f.id,
                            activations,
                          });
                        }}
                        onInjuryAdded={(injury) => {
                          setLocalFighters((cur) =>
                            cur.map((lf) =>
                              lf.id === f.id
                                ? { ...lf, session_record: { ...lf.session_record, injuries: [...(lf.session_record?.injuries ?? []), injury] } }
                                : lf
                            )
                          );
                        }}
                        onNoteChanged={(note) => {
                          updateNoteMutation.mutate({ sessionFighterId: f.id, note });
                        }}
                        onBroadcast={onBroadcast}
                      />
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {canInteract && (
            <div className="border-t border-neutral-100 pt-3 dark:border-neutral-700">
              <label className="mb-1 block text-sm text-neutral-500">
                Credits Earned
                <span className="text-xs text-muted-foreground"> (Current: {localCreditsEarned})</span>
              </label>
              <div className="flex items-center gap-2 max-w-[250px]">
                <input
                  type="tel"
                  inputMode="url"
                  pattern="-?[0-9]+"
                  value={creditsDelta}
                  onChange={(e) => setCreditsDelta(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-sm border border-neutral-300 px-3 py-2 text-base md:text-sm dark:border-neutral-600 dark:bg-neutral-800"
                />
                <Button
                  size="sm"
                  onClick={() => gangOutcomeMutation.mutate(creditsDelta)}
                  disabled={!creditsDelta || (parseInt(creditsDelta) || 0) === 0 || gangOutcomeMutation.isPending}
                >
                  Save
                </Button>
              </div>
            </div>
          )}

          {!canInteract && battleActive && localCreditsEarned !== 0 && (
            <div className="border-t border-neutral-100 pt-3 text-sm dark:border-neutral-700">
              <span>Credits: {localCreditsEarned > 0 ? '+' : ''}{localCreditsEarned}</span>
            </div>
          )}
        </div>

          {canPostBattle && (
            <div className="border-t border-neutral-100 pt-3 dark:border-neutral-700 grid grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-3 gap-3">
              {!hasTradePoints(session.edition_slug) && (
                <div className="col-span-full">
                  <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                    <span className="text-sm text-neutral-500">Trading Post Roll</span>
                    {tradingPostRoll && (
                      <span className="text-xs text-muted-foreground">
                        Roll {tradingPostRoll.total} ({tradingPostRoll.dice.join(', ')})
                        {tradingPostRoll.modifier !== 0 && ` ${tradingPostRoll.modifier > 0 ? '+' : ''}${tradingPostRoll.modifier} = ${tradingPostRoll.grandTotal}`}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-nowrap">
                    <Button
                      size="sm"
                      onClick={() => {
                        const result = rollNd6Outcome(2);
                        const mod = parseInt(tradingPostModifier) || 0;
                        const grandTotal = result.total + mod;
                        setTradingPostRoll({
                          dice: result.dice,
                          total: result.total,
                          modifier: mod,
                          grandTotal,
                        });
                        const desc = mod !== 0
                          ? `Roll ${result.total} (${result.dice.join(', ')}) ${mod > 0 ? '+' : ''}${mod} = ${grandTotal}`
                          : `Roll ${result.total} (${result.dice.join(', ')})`;
                        createGangLog({
                          gang_id: participant.gang_id,
                          action_type: 'trading_post_roll',
                          description: desc,
                        });
                      }}
                    >
                      Roll
                    </Button>
                    <input
                      type="tel"
                      inputMode="url"
                      value={tradingPostModifier}
                      onChange={(e) => setTradingPostModifier(e.target.value)}
                      placeholder="Modifier"
                      className="w-20 rounded-sm border border-neutral-300 px-2 py-2 text-base md:text-sm dark:border-neutral-600 dark:bg-neutral-800 shrink-0"
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm text-neutral-500">
                  Reputation Change
                  <span className="text-xs text-muted-foreground"> (Current: {localRepChange})</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="tel"
                    inputMode="url"
                    pattern="-?[0-9]+"
                    value={repDelta}
                    onChange={(e) => setRepDelta(e.target.value)}
                    placeholder="+/-"
                    className="w-full rounded-sm border border-neutral-300 px-3 py-2 text-base md:text-sm dark:border-neutral-600 dark:bg-neutral-800"
                  />
                  <Button
                    size="sm"
                    onClick={() => repOutcomeMutation.mutate(repDelta)}
                    disabled={!repDelta || (parseInt(repDelta) || 0) === 0 || repOutcomeMutation.isPending}
                  >
                    Save
                  </Button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-neutral-500">
                  Credits Earned
                  <span className="text-xs text-muted-foreground"> (Current: {localCreditsEarned})</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="tel"
                    inputMode="url"
                    pattern="-?[0-9]+"
                    value={creditsDelta}
                    onChange={(e) => setCreditsDelta(e.target.value)}
                    placeholder="+/-"
                    className="w-full rounded-sm border border-neutral-300 px-3 py-2 text-base md:text-sm dark:border-neutral-600 dark:bg-neutral-800"
                  />
                  <Button
                    size="sm"
                    onClick={() => gangOutcomeMutation.mutate(creditsDelta)}
                    disabled={!creditsDelta || (parseInt(creditsDelta) || 0) === 0 || gangOutcomeMutation.isPending}
                  >
                    Save
                  </Button>
                </div>
              </div>
              {session.campaign_resources && campaignGangId && session.campaign_resources.map((res) => {
                const current = localResourceChanges.find((r) => r.resource_id === res.id);
                const currentDelta = current?.quantity_delta ?? 0;
                return (
                  <div key={res.id}>
                    <label className="mb-1 block text-sm text-neutral-500">
                      {res.resource_name}
                      <span className="text-xs text-muted-foreground"> (Current: {currentDelta})</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="tel"
                        inputMode="url"
                        pattern="-?[0-9]+"
                        value={resourceDeltas[res.id] ?? ''}
                        onChange={(e) => setResourceDeltas((cur) => ({ ...cur, [res.id]: e.target.value }))}
                        placeholder="+/-"
                        className="w-full rounded-sm border border-neutral-300 px-3 py-2 text-base md:text-sm dark:border-neutral-600 dark:bg-neutral-800"
                      />
                      <Button
                        size="sm"
                        onClick={() => resourceOutcomeMutation.mutate({
                          resource_id: res.id,
                          resource_name: res.resource_name,
                          is_custom: res.is_custom,
                          deltaStr: resourceDeltas[res.id] ?? '',
                        })}
                        disabled={
                          !resourceDeltas[res.id] ||
                          (parseInt(resourceDeltas[res.id]) || 0) === 0 ||
                          resourceOutcomeMutation.isPending
                        }
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {isPostBattle && !isMyGang && !isArbitrator && (localRepChange !== 0 || localCreditsEarned !== 0 || localResourceChanges.some((r) => r.quantity_delta !== 0)) && (
            <div className="border-t border-neutral-100 pt-3 text-sm dark:border-neutral-700 flex gap-4 flex-wrap">
              {localRepChange !== 0 && (
                <span>Reputation: {localRepChange > 0 ? '+' : ''}{localRepChange}</span>
              )}
              {localCreditsEarned !== 0 && (
                <span>Credits: {localCreditsEarned > 0 ? '+' : ''}{localCreditsEarned}</span>
              )}
              {localResourceChanges.filter((r) => r.quantity_delta !== 0).map((r) => (
                <span key={r.resource_id}>
                  {r.resource_name}: {r.quantity_delta > 0 ? '+' : ''}{r.quantity_delta}
                </span>
              ))}
            </div>
          )}
    </div>
  );
}
