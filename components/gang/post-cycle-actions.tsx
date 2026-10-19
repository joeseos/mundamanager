'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import Modal from '@/components/ui/modal';
import { FighterProps } from '@/types/fighter';
import type { FighterEffect } from '@/types/fighter-effect';
import type { GangTacticsCard, TacticsCard } from '@/types/tactics-card';
import { UserPermissions } from '@/types/user-permissions';
import { getFighterSubtypeSortRank } from '@/utils/fighterSubtypeRank';
import { formatFighterSubtypeDisplay } from '@/utils/fighterSubtypeDisplay';
import { countsTowardRating } from '@/utils/fighter-status';
import {
  CHOP_SHOP_COST_PER_DAMAGE,
  FIT_BIONICS_COST_PER_INJURY,
  POST_CYCLE_ACTIONS,
  SUIT_EVOLUTION_KILL_COST,
  TRAIN_XP,
  assignmentCreditsDelta,
  eligiblePostCycleActions,
  hasCriticalInjury,
  lastingDamagesOf,
  patientOf,
  postCycleAvailability,
  postCycleDiscount,
  removableLastingInjuriesOf,
  reputationIncome,
  rigGlitchNames,
  rigGlitchesOf,
  validatePostCycleAssignment,
  type PostCycleActionId,
  type PostCycleAssignment,
} from '@/utils/postCycleActions';
import {
  collectReputationIncome,
  resolvePostCycleAction,
  type PostCycleFighterChange,
} from '@/app/actions/post-cycle-actions';

const TacticsCardPicker = dynamic(() => import('@/components/gang/tactics-card-picker'), { ssr: false });

interface PostCycleActionsProps {
  gangId: string;
  editionSlug?: string | null;
  fighters: FighterProps[];
  gangCredits: number;
  gangReputation: number;
  /** Gang facts the gang-specific actions depend on; see postCycleAvailability. */
  gangType?: string | null;
  isCustomGangType: boolean;
  gangSubtypes: Array<{ id: string; subtype: string }>;
  /** What the gang already holds, which Develop Tactics cannot pick again. */
  tacticsCards: GangTacticsCard[];
  userPermissions?: UserPermissions;
  onFighterUpdate?: (fighter: FighterProps, skipRatingUpdate?: boolean) => void;
  onGangFinancialsUpdate?: (financials: { credits: number; rating: number; wealth: number }) => void;
  onTacticsCardAdded?: (card: GangTacticsCard) => void;
}

/** A row may be half-filled, so it is not yet a PostCycleAssignment. */
interface RowState {
  action: PostCycleActionId;
  targetFighterId?: string;
  injuryIds: string[];
  /** Develop Tactics; the name is only for showing the pick. */
  tacticsCard?: Pick<TacticsCard, 'id' | 'name'>;
  /** Visit Chop Shop: the vehicle's Lasting Damage to repair. */
  damageIds?: string[];
}

/** Null while the row still lacks a pick its action needs. */
function toAssignment(fighterId: string, row: RowState): PostCycleAssignment | null {
  const { action, targetFighterId, injuryIds, tacticsCard, damageIds } = row;
  switch (action) {
    case 'medical_escort':
      return targetFighterId ? { fighterId, action, targetFighterId } : null;
    case 'fit_bionics':
      return targetFighterId && injuryIds.length > 0
        ? { fighterId, action, targetFighterId, injuryIds }
        : null;
    case 'develop_tactics':
      return tacticsCard ? { fighterId, action, tacticsCardId: tacticsCard.id } : null;
    case 'visit_chop_shop':
      return damageIds?.length ? { fighterId, action, damageIds } : null;
    default:
      return { fighterId, action };
  }
}

/** The gang page keeps fighters in state, so server changes are replayed onto them. */
function applyChange(fighter: FighterProps, change: PostCycleFighterChange): FighterProps {
  const next: FighterProps = { ...fighter };

  if (change.removedEffectIds?.length || change.addedInjury) {
    const removed = new Set(change.removedEffectIds ?? []);
    const keep = (effects: FighterEffect[]) => effects.filter((effect) => !removed.has(effect.id));
    const kept = keep(next.effects?.injuries ?? []);
    // Only a vehicle has these, repaired by Visit Chop Shop.
    const damages = next.effects?.['lasting damages'];
    // Cleared by a Spyrer's Suit Maintenance.
    const glitches = next.effects?.['rig-glitches'];

    next.effects = {
      ...next.effects,
      injuries: change.addedInjury ? [...kept, change.addedInjury] : kept,
      ...(damages && { 'lasting damages': keep(damages) }),
      ...(glitches && { 'rig-glitches': keep(glitches) }),
    };
  }

  if (change.killed !== undefined) next.killed = change.killed;
  if (change.recovery !== undefined) next.recovery = change.recovery;
  if (change.xpDelta) next.xp = (next.xp ?? 0) + change.xpDelta;

  return next;
}

function EffectChecklist({
  effects,
  selected,
  costEach,
  discount = 0,
  onChange,
  disabled,
  emptyText,
}: {
  effects: FighterEffect[];
  selected: string[];
  costEach: number;
  /** A Doc discount, taken off the total rather than each row. */
  discount?: number;
  onChange: (ids: string[]) => void;
  disabled: boolean;
  emptyText: string;
}) {
  if (effects.length === 0) {
    return <p className="text-xs italic text-muted-foreground">{emptyText}</p>;
  }

  const toggle = (id: string) =>
    onChange(
      selected.includes(id) ? selected.filter((existing) => existing !== id) : [...selected, id]
    );

  return (
    <div className="rounded-md border divide-y">
      {effects.map((effect) => (
        <label
          key={effect.id}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm ${
            disabled ? '' : 'cursor-pointer hover:bg-muted'
          }`}
        >
          <Checkbox
            checked={selected.includes(effect.id)}
            onCheckedChange={() => toggle(effect.id)}
            disabled={disabled}
          />
          <span className="flex-1 min-w-0 truncate">{effect.effect_name}</span>
          <span className="text-xs text-muted-foreground">{costEach} credits</span>
        </label>
      ))}
      {discount > 0 && (
        <p className="px-3 py-1.5 text-xs text-muted-foreground">
          {discount} credits off the total, never below 0
        </p>
      )}
    </div>
  );
}

export default function PostCycleActions({
  gangId,
  editionSlug,
  fighters,
  gangCredits,
  gangReputation,
  gangType,
  isCustomGangType,
  gangSubtypes,
  tacticsCards,
  userPermissions,
  onFighterUpdate,
  onGangFinancialsUpdate,
  onTacticsCardAdded,
}: PostCycleActionsProps) {
  /** The actions picked so far; nothing is applied until Confirm. */
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [applying, setApplying] = useState(false);
  const [collecting, setCollecting] = useState(false);
  /** Why an action failed on the last Confirm, keyed by the fighter taking it. */
  const [failures, setFailures] = useState<Record<string, string>>({});
  /** The fighter whose Gang Tactic is being picked, and the pick so far. */
  const [tacticsPickerFor, setTacticsPickerFor] = useState<string | null>(null);
  const [tacticsPick, setTacticsPick] = useState<RowState['tacticsCard'] | null>(null);
  /** The vehicle whose Lasting Damage is being picked for the Chop Shop, and the pick so far. */
  const [damagePickerFor, setDamagePickerFor] = useState<string | null>(null);
  const [damagePick, setDamagePick] = useState<string[]>([]);

  const canEdit = userPermissions?.canEdit ?? false;
  const availability = useMemo(
    () =>
      postCycleAvailability({
        editionSlug,
        gangType,
        isCustomGangType,
        subtypeNames: gangSubtypes.map((s) => s.subtype),
      }),
    [editionSlug, gangType, isCustomGangType, gangSubtypes]
  );
  const fighterById = useMemo(() => new Map(fighters.map((f) => [f.id, f])), [fighters]);
  const ownedTacticsCardIds = useMemo(
    () => new Set(tacticsCards.map((card) => card.tactics_cards_id)),
    [tacticsCards]
  );

  const actors = useMemo(
    () =>
      fighters
        .filter((f) => eligiblePostCycleActions(f, availability).length > 0)
        .sort(
          (a, b) =>
            getFighterSubtypeSortRank(a.fighter_subtypes, editionSlug) -
              getFighterSubtypeSortRank(b.fighter_subtypes, editionSlug) ||
            a.fighter_name.localeCompare(b.fighter_name)
        ),
    [fighters, availability, editionSlug]
  );
  const actorIds = useMemo(() => new Set(actors.map((f) => f.id)), [actors]);

  // Dead, retired, captured or enslaved fighters cannot be taken to the Doc.
  const criticallyInjured = useMemo(
    () => fighters.filter((f) => countsTowardRating(f) && hasCriticalInjury(f)),
    [fighters]
  );
  const injuredFighters = useMemo(
    () =>
      fighters.filter((f) => countsTowardRating(f) && removableLastingInjuriesOf(f).length > 0),
    [fighters]
  );

  // A fighter who can no longer act (e.g. sent to Recovery meanwhile) keeps no action.
  const activeRows = useMemo(
    () => new Map(Object.entries(rows).filter(([fighterId]) => actorIds.has(fighterId))),
    [rows, actorIds]
  );

  /** One validated assignment per pending row, keyed by the fighter taking it. */
  const rowStates = useMemo(() => {
    const states = new Map<
      string,
      { assignment: PostCycleAssignment | null; issues: string[]; cost: number }
    >();
    const patientsTaken = new Set<string>();
    const tacticsTaken = new Set<string>();

    for (const [fighterId, row] of activeRows) {
      const assignment = toAssignment(fighterId, row);
      const issues = assignment
        ? validatePostCycleAssignment(fighters, assignment, availability)
        : [];

      // The server checks one action at a time, so these rules across rows are
      // the panel's: a patient takes no action of their own and sees the Doc once.
      const patientId = assignment && patientOf(assignment);
      if (patientId) {
        const name = fighterById.get(patientId)?.fighter_name ?? 'That fighter';
        if (activeRows.has(patientId)) issues.push(`${name} has an action of their own.`);
        else if (patientsTaken.has(patientId)) issues.push(`${name} is already being taken to the Doc.`);
        patientsTaken.add(patientId);
      }
      // Two fighters developing the same card would add it once.
      if (assignment?.action === 'develop_tactics') {
        if (tacticsTaken.has(assignment.tacticsCardId)) {
          issues.push(`${row.tacticsCard?.name} is already being developed.`);
        }
        tacticsTaken.add(assignment.tacticsCardId);
      }
      states.set(fighterId, {
        assignment,
        issues,
        cost: assignment ? -assignmentCreditsDelta(assignment, fighterById.get(fighterId)!) : 0,
      });
    }
    return states;
  }, [activeRows, fighters, availability, fighterById]);

  const pendingStates = [...rowStates.values()];
  const totalSpend = pendingStates.reduce((sum, s) => sum + Math.max(s.cost, 0), 0);
  const cannotAfford = totalSpend > gangCredits;
  const readyToApply =
    pendingStates.length > 0 &&
    pendingStates.every((s) => s.assignment && s.issues.length === 0) &&
    !cannotAfford;

  // Each picked row takes one of its action's slots.
  const takenCounts = useMemo(() => {
    const counts = new Map<PostCycleActionId, number>();
    for (const { action } of activeRows.values()) {
      counts.set(action, (counts.get(action) ?? 0) + 1);
    }
    return counts;
  }, [activeRows]);

  const setRow = (fighterId: string, next: Partial<RowState>) =>
    setRows((prev) => {
      const current = prev[fighterId];
      return current ? { ...prev, [fighterId]: { ...current, ...next } } : prev;
    });

  const handleActionChange = (fighterId: string, value: string) =>
    setRows((prev) => {
      if (!value) {
        const { [fighterId]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [fighterId]: { action: value as PostCycleActionId, injuryIds: [] } };
    });

  const unavailableReason = (fighter: FighterProps, actionId: PostCycleActionId) => {
    const { maxFighters } = POST_CYCLE_ACTIONS[actionId];
    if (
      maxFighters !== undefined &&
      (takenCounts.get(actionId) ?? 0) >= maxFighters &&
      rows[fighter.id]?.action !== actionId
    ) {
      return maxFighters === 1 ? 'Already taken' : `All ${maxFighters} taken`;
    }

    switch (actionId) {
      case 'medical_escort':
        return criticallyInjured.some((f) => f.id !== fighter.id)
          ? null
          : 'No Critical Injuries';
      case 'fit_bionics':
        return injuredFighters.some((f) => f.id !== fighter.id) ? null : 'No Lasting Injuries';
      case 'visit_chop_shop':
        return lastingDamagesOf(fighter).length > 0 ? null : 'No Lasting Damage';
      case 'suit_evolution':
        return (fighter.kill_count ?? 0) < SUIT_EVOLUTION_KILL_COST
          ? `Needs ${SUIT_EVOLUTION_KILL_COST} kills`
          : null;
      case 'suit_maintenance':
        return rigGlitchesOf(fighter).length > 0 ? null : 'No Rig Glitches';
      default:
        return null;
    }
  };

  const openTacticsPicker = (fighterId: string) => {
    setTacticsPick(rows[fighterId]?.tacticsCard ?? null);
    setTacticsPickerFor(fighterId);
  };

  const openDamagePicker = (fighterId: string) => {
    setDamagePick(rows[fighterId]?.damageIds ?? []);
    setDamagePickerFor(fighterId);
  };
  const damagePickerVehicle = damagePickerFor ? fighterById.get(damagePickerFor) : undefined;

  const patientOptions = (performerId: string, candidates: FighterProps[]) =>
    candidates
      .filter((f) => f.id !== performerId)
      .map((f) => {
        const reason = activeRows.has(f.id) ? 'has an action' : null;
        return {
          value: f.id,
          label: reason ? (
            <span className="text-muted-foreground">
              {f.fighter_name} - {reason}
            </span>
          ) : (
            f.fighter_name
          ),
          displayValue: f.fighter_name,
          disabled: reason !== null,
        };
      });

  /** What a row will do on Confirm, as far as it is known beforehand. */
  const effectOf = (assignment: PostCycleAssignment | null) => {
    if (!assignment) return null;
    if (assignment.action === 'train') return `+${TRAIN_XP} XP`;
    if (assignment.action === 'develop_tactics') return rows[assignment.fighterId]?.tacticsCard?.name ?? null;
    const delta = assignmentCreditsDelta(assignment, fighterById.get(assignment.fighterId)!);
    // A Doc discount can make an action free, which is still worth saying.
    const isDocAction = assignment.action === 'medical_escort' || assignment.action === 'fit_bionics';
    const credits =
      delta !== 0 ? `${delta > 0 ? '+' : ''}${delta} credits` : isDocAction ? '0 credits' : null;
    if (assignment.action === 'visit_chop_shop') {
      const vehicle = fighterById.get(assignment.fighterId);
      const repaired = vehicle
        ? lastingDamagesOf(vehicle).filter((damage) => assignment.damageIds.includes(damage.id))
        : [];
      return (
        <>
          <span className="block">{repaired.map((damage) => damage.effect_name).join(', ')}</span>
          <span className="block">{credits}</span>
        </>
      );
    }
    if (assignment.action === 'suit_maintenance') {
      const spyrer = fighterById.get(assignment.fighterId);
      return (
        <>
          <span className="block">{spyrer && rigGlitchNames(rigGlitchesOf(spyrer))}</span>
          <span className="block">{credits}</span>
        </>
      );
    }
    return credits;
  };

  /**
   * Applies every picked action. One server call each, in roster order, so each
   * is checked against what the ones before it saved. An applied row is cleared.
   * A failure does not stop the rest; its row keeps its pick and shows why.
   */
  const handleApply = async () => {
    const queue = actors.flatMap((f) => {
      const assignment = rowStates.get(f.id)?.assignment;
      return assignment ? [assignment] : [];
    });
    if (applying || queue.length === 0) return;

    setApplying(true);
    setFailures({});
    let failed = 0;

    for (const assignment of queue) {
      const { fighterId } = assignment;
      try {
        const result = await resolvePostCycleAction({ gangId, assignment });

        // skipRatingUpdate: the authoritative rating arrives with the gang below.
        for (const change of result.outcome?.changes ?? []) {
          const current = fighterById.get(change.fighterId);
          if (current) onFighterUpdate?.(applyChange(current, change), true);
        }
        if (result.gang) onGangFinancialsUpdate?.(result.gang);
        if (result.outcome?.addedTacticsCard) onTacticsCardAdded?.(result.outcome.addedTacticsCard);

        if (!result.success) {
          failed++;
          setFailures((prev) => ({ ...prev, [fighterId]: result.error || 'The action failed.' }));
        }

        // A partial failure still spent the action, so its row is cleared too.
        if (result.landed) {
          setRows((prev) => {
            const { [fighterId]: _done, ...rest } = prev;
            return rest;
          });
        }
      } catch (error) {
        failed++;
        setFailures((prev) => ({
          ...prev,
          [fighterId]: error instanceof Error ? error.message : 'The action failed.',
        }));
      }
    }

    setApplying(false);
    if (failed > 0) {
      toast.error(`${failed} of ${queue.length} Post-cycle Actions failed. See the marked rows.`);
    } else {
      toast.success('Post-cycle Actions applied');
    }
  };

  const income = reputationIncome(gangReputation);

  const handleCollectIncome = async () => {
    setCollecting(true);
    try {
      const result = await collectReputationIncome(gangId);
      if (result.gang) onGangFinancialsUpdate?.(result.gang);
      if (result.success) {
        toast.success(`Collected ${result.credits} credits from Reputation`);
      } else {
        toast.error(result.error || 'Failed to collect income');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to collect income');
    } finally {
      setCollecting(false);
    }
  };

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold mb-4">
        Post-Cycle Actions
      </h3>

      <div className="rounded-md border px-4 py-3 mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium">Collect Income</div>
          <div className="text-xs text-muted-foreground">
            {gangReputation} Reputation: +{income} credits
          </div>
        </div>
        <Button
          size="sm"
          onClick={handleCollectIncome}
          disabled={!canEdit || collecting || applying || income === 0}
        >
          {collecting ? 'Collecting…' : 'Collect'}
        </Button>
      </div>

      {actors.length > 0 && (
        <div className="rounded-md border">
          <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_20rem_10rem] gap-4 px-4 py-2 bg-muted border-b rounded-t-md text-sm font-medium">
            <span>Fighter</span>
            <span>Action</span>
            <span>Effect</span>
          </div>
          <ul>
            {actors.map((fighter) => {
              const row = rows[fighter.id];
              const state = rowStates.get(fighter.id);
              const assignment = state?.assignment ?? null;
              const effect = effectOf(assignment);
              const rowIssues = state?.issues ?? [];
              const target = row?.targetFighterId
                ? fighterById.get(row.targetFighterId)
                : undefined;
              // Shown even once the row is cleared, for an action that partly applied.
              const failure = failures[fighter.id];

              return (
                <li
                  key={fighter.id}
                  className="border-b last:border-0 px-4 py-3 md:grid md:grid-cols-[minmax(0,1fr)_20rem_10rem] md:gap-4 md:items-start"
                >
                  <div className="flex items-start justify-between gap-3 mb-2 md:mb-0 md:pt-2 min-w-0">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{fighter.fighter_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {`${fighter.fighter_type} (${formatFighterSubtypeDisplay(
                          fighter.fighter_subtypes,
                          editionSlug
                        )})`}
                      </div>
                    </div>
                    {effect && <span className="md:hidden max-w-[50%] text-right">{effect}</span>}
                  </div>

                  <div className="space-y-2 min-w-0">
                    <Combobox
                      options={eligiblePostCycleActions(fighter, availability).map((option) => {
                        const reason = unavailableReason(fighter, option.id);
                        return {
                          value: option.id,
                          label: (
                            <span className={reason ? 'text-muted-foreground' : undefined}>
                              {option.label} - {reason ?? option.summary}
                            </span>
                          ),
                          displayValue: option.label,
                          disabled: reason !== null && row?.action !== option.id,
                        };
                      })}
                      value={row?.action ?? ''}
                      onValueChange={(value) => handleActionChange(fighter.id, value)}
                      placeholder="No action"
                      clearable
                      disabled={!canEdit || applying}
                    />

                    {row?.action === 'medical_escort' && (
                      <Combobox
                        options={patientOptions(fighter.id, criticallyInjured)}
                        value={row.targetFighterId ?? ''}
                        onValueChange={(id) => setRow(fighter.id, { targetFighterId: id || undefined })}
                        placeholder="Critically Injured fighter"
                        noResultsText="No fighter has a Critical Injury"
                        clearable
                        disabled={!canEdit || applying}
                      />
                    )}

                    {row?.action === 'fit_bionics' && (
                      <>
                        <Combobox
                          options={patientOptions(fighter.id, injuredFighters)}
                          value={row.targetFighterId ?? ''}
                          // Switching patient drops the injuries picked for the last one.
                          onValueChange={(id) =>
                            setRow(fighter.id, { targetFighterId: id || undefined, injuryIds: [] })
                          }
                          placeholder="Fighter to fit bionics"
                          noResultsText="No fighter has a removable Lasting Injury"
                          clearable
                          disabled={!canEdit || applying}
                        />
                        {target && (
                          <EffectChecklist
                            effects={removableLastingInjuriesOf(target)}
                            selected={row.injuryIds}
                            costEach={FIT_BIONICS_COST_PER_INJURY}
                            discount={postCycleDiscount(fighter, 'fit_bionics')}
                            onChange={(injuryIds) => setRow(fighter.id, { injuryIds })}
                            disabled={!canEdit || applying}
                            emptyText="No removable Lasting Injuries. A Critical Injury cannot be removed with bionics."
                          />
                        )}
                      </>
                    )}

                    {row?.action === 'visit_chop_shop' && (
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => openDamagePicker(fighter.id)}
                        disabled={!canEdit || applying}
                      >
                        Choose Lasting Damage
                      </Button>
                    )}

                    {row?.action === 'develop_tactics' && (
                      <Button
                        size="sm"
                        className="w-full"
                        onClick={() => openTacticsPicker(fighter.id)}
                        disabled={!canEdit || applying}
                      >
                        Choose Gang Tactic
                      </Button>
                    )}

                    {[...rowIssues, ...(failure ? [failure] : [])].map((message) => (
                      <p key={message} className="text-xs text-red-600">
                        {message}
                      </p>
                    ))}
                  </div>

                  <span className="hidden md:block md:pt-2">{effect}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {pendingStates.length > 0 && (
        <div className="mt-4 flex flex-col items-end gap-2">
          {cannotAfford && (
            <p className="text-xs text-red-600">
              The gang cannot afford these actions ({totalSpend} credits).
            </p>
          )}
          <Button onClick={handleApply} disabled={!canEdit || applying || !readyToApply}>
            {applying
              ? 'Applying…'
              : `Apply ${pendingStates.length} Post-cycle Action${pendingStates.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      )}

      {tacticsPickerFor && (
        <Modal
          title="Develop Tactics"
          helper={`Pick the Gang Tactic ${fighterById.get(tacticsPickerFor)?.fighter_name ?? 'this fighter'} develops. It is added when the Post-cycle Actions are applied.`}
          content={
            <TacticsCardPicker
              gangId={gangId}
              ownedCardIds={ownedTacticsCardIds}
              selectedCardIds={new Set(tacticsPick ? [tacticsPick.id] : [])}
              onSelectionChange={(_ids, cards) => setTacticsPick(cards[0] ?? null)}
              single
            />
          }
          onClose={() => setTacticsPickerFor(null)}
          onConfirm={() => {
            if (tacticsPick) {
              setRow(tacticsPickerFor, {
                tacticsCard: { id: tacticsPick.id, name: tacticsPick.name },
              });
            }
          }}
          confirmText="Choose"
          confirmDisabled={!tacticsPick}
          width="lg"
        />
      )}

      {damagePickerVehicle && (
        <Modal
          title="Visit Chop Shop"
          helper={`Pick the Lasting Damage ${damagePickerVehicle.fighter_name} has repaired. It is repaired and paid for when the Post-cycle Actions are applied.`}
          content={
            <EffectChecklist
              effects={lastingDamagesOf(damagePickerVehicle)}
              selected={damagePick}
              costEach={CHOP_SHOP_COST_PER_DAMAGE}
              onChange={setDamagePick}
              disabled={!canEdit}
              emptyText="No Lasting Damage to repair."
            />
          }
          onClose={() => setDamagePickerFor(null)}
          onConfirm={() => setRow(damagePickerVehicle.id, { damageIds: damagePick })}
          confirmText="Choose"
          confirmDisabled={damagePick.length === 0}
        />
      )}
    </div>
  );
}
