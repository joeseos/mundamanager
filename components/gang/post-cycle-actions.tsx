'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import { GrCycle } from 'react-icons/gr';
import { FighterProps } from '@/types/fighter';
import type { FighterEffect } from '@/types/fighter-effect';
import { UserPermissions } from '@/types/user-permissions';
import { useFighterCardModals } from '@/components/gang/fighter-card-modals-context';
import { getFighterSubtypeSortRank } from '@/utils/fighterSubtypeRank';
import { formatFighterSubtypeDisplay } from '@/utils/fighterSubtypeDisplay';
import { countsTowardRating } from '@/utils/fighter-status';
import {
  FIT_BIONICS_COST_PER_INJURY,
  POST_CYCLE_ACTIONS,
  SUIT_EVOLUTION_KILL_COST,
  TRAIN_XP,
  assignmentCreditsDelta,
  eligiblePostCycleActions,
  hasCriticalInjury,
  patientOf,
  postCycleAvailability,
  removableLastingInjuriesOf,
  validatePostCycleAssignment,
  type PostCycleActionId,
  type PostCycleAssignment,
} from '@/utils/postCycleActions';
import {
  resolvePostCycleAction,
  type PostCycleFighterChange,
} from '@/app/actions/post-cycle-actions';

interface PostCycleActionsProps {
  gangId: string;
  editionSlug?: string | null;
  fighters: FighterProps[];
  gangCredits: number;
  /** Gang facts the gang-specific actions depend on; see postCycleAvailability. */
  gangType?: string | null;
  isCustomGangType: boolean;
  gangSubtypes: Array<{ id: string; subtype: string }>;
  userPermissions?: UserPermissions;
  onFighterUpdate?: (fighter: FighterProps, skipRatingUpdate?: boolean) => void;
  onGangFinancialsUpdate?: (financials: { credits: number; rating: number; wealth: number }) => void;
}

/** A row may be half-filled, so it is not yet a PostCycleAssignment. */
interface RowState {
  action: PostCycleActionId;
  targetFighterId?: string;
  injuryIds: string[];
}

/** Null while the row still lacks a pick its action needs. */
function toAssignment(fighterId: string, row: RowState): PostCycleAssignment | null {
  const { action, targetFighterId, injuryIds } = row;
  switch (action) {
    case 'medical_escort':
      return targetFighterId ? { fighterId, action, targetFighterId } : null;
    case 'fit_bionics':
      return targetFighterId && injuryIds.length > 0
        ? { fighterId, action, targetFighterId, injuryIds }
        : null;
    default:
      return { fighterId, action };
  }
}

/** The gang page keeps fighters in state, so server changes are replayed onto them. */
function applyChange(fighter: FighterProps, change: PostCycleFighterChange): FighterProps {
  const next: FighterProps = { ...fighter };

  if (change.removedEffectIds?.length || change.addedInjury) {
    const removed = new Set(change.removedEffectIds ?? []);
    const kept = (next.effects?.injuries ?? []).filter((effect) => !removed.has(effect.id));

    next.effects = {
      ...next.effects,
      injuries: change.addedInjury
        ? [...kept, change.addedInjury as (typeof kept)[number]]
        : kept,
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
  onChange,
  disabled,
  emptyText,
}: {
  effects: FighterEffect[];
  selected: string[];
  costEach: number;
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
    </div>
  );
}

export default function PostCycleActions({
  gangId,
  editionSlug,
  fighters,
  gangCredits,
  gangType,
  isCustomGangType,
  gangSubtypes,
  userPermissions,
  onFighterUpdate,
  onGangFinancialsUpdate,
}: PostCycleActionsProps) {
  /** The actions picked so far; nothing is applied until Confirm. */
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [applying, setApplying] = useState(false);
  /** Why an action failed on the last Confirm, keyed by the fighter taking it. */
  const [failures, setFailures] = useState<Record<string, string>>({});
  /**
   * What each fighter did on Confirm. The rules a single server call cannot
   * see (one action per fighter, the per-action caps) are held here and in
   * `rows`; everything else is enforced by the saved state each action leaves.
   */
  const [resolved, setResolved] = useState<
    Record<string, { action: PostCycleActionId; outcome: string }>
  >({});

  const canEdit = userPermissions?.canEdit ?? false;
  const fighterCardModals = useFighterCardModals();
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
        if (resolved[patientId]) issues.push(`${name} has already acted this sequence.`);
        else if (activeRows.has(patientId)) issues.push(`${name} has an action of their own.`);
        else if (patientsTaken.has(patientId)) issues.push(`${name} is already being taken to the Doc.`);
        patientsTaken.add(patientId);
      }
      states.set(fighterId, {
        assignment,
        issues,
        cost: assignment ? -assignmentCreditsDelta(assignment) : 0,
      });
    }
    return states;
  }, [activeRows, fighters, availability, resolved, fighterById]);

  const pendingStates = [...rowStates.values()];
  const totalSpend = pendingStates.reduce((sum, s) => sum + Math.max(s.cost, 0), 0);
  const cannotAfford = totalSpend > gangCredits;
  const readyToApply =
    pendingStates.length > 0 &&
    pendingStates.every((s) => s.assignment && s.issues.length === 0) &&
    !cannotAfford;

  // Both halves count: a cap is for the whole sequence, so rows still waiting
  // to resolve take slots just as resolved ones do.
  const takenCounts = useMemo(() => {
    const counts = new Map<PostCycleActionId, number>();
    for (const { action } of [...Object.values(resolved), ...activeRows.values()]) {
      counts.set(action, (counts.get(action) ?? 0) + 1);
    }
    return counts;
  }, [resolved, activeRows]);

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
      return `All ${maxFighters} taken`;
    }

    switch (actionId) {
      case 'medical_escort':
        return criticallyInjured.some((f) => f.id !== fighter.id)
          ? null
          : 'No Critical Injuries';
      case 'fit_bionics':
        return injuredFighters.some((f) => f.id !== fighter.id) ? null : 'No Lasting Injuries';
      case 'suit_evolution':
        return (fighter.kill_count ?? 0) < SUIT_EVOLUTION_KILL_COST
          ? `Needs ${SUIT_EVOLUTION_KILL_COST} kills`
          : null;
      default:
        return null;
    }
  };

  const patientOptions = (performerId: string, candidates: FighterProps[]) =>
    candidates
      .filter((f) => f.id !== performerId)
      .map((f) => {
        const reason = resolved[f.id]
          ? 'already acted'
          : activeRows.has(f.id)
            ? 'has an action'
            : null;
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

  /** What a row will do on resolving, as far as it is known beforehand. */
  const effectOf = (assignment: PostCycleAssignment | null) => {
    if (!assignment) return null;
    if (assignment.action === 'train') return `+${TRAIN_XP} XP`;
    const delta = assignmentCreditsDelta(assignment);
    return delta === 0 ? null : `${delta > 0 ? '+' : ''}${delta} credits`;
  };

  /**
   * Applies every picked action. One server call each, in roster order, so each
   * is checked against what the ones before it saved. A failure does not stop
   * the rest; its row keeps its pick and shows why.
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
        const outcome = result.outcome;

        // skipRatingUpdate: the authoritative rating arrives with the gang below.
        for (const change of outcome?.changes ?? []) {
          const current = fighterById.get(change.fighterId);
          if (current) onFighterUpdate?.(applyChange(current, change), true);
        }
        if (result.gang) onGangFinancialsUpdate?.(result.gang);

        if (!result.success) {
          failed++;
          setFailures((prev) => ({ ...prev, [fighterId]: result.error || 'The action failed.' }));
        }

        // A partial failure still spent the action, so it is recorded like a success.
        if (!result.landed || !outcome) continue;

        const patientId = patientOf(assignment);
        setResolved((prev) => ({
          ...prev,
          [fighterId]: { action: outcome.action, outcome: outcome.outcome },
          // A fighter taken to the Doc spends no action of their own.
          ...(patientId
            ? {
                [patientId]: {
                  action: outcome.action,
                  outcome: `Taken to the Doc by ${outcome.fighterName}.`,
                },
              }
            : {}),
        }));
        setRows((prev) => {
          const { [fighterId]: _done, ...rest } = prev;
          return rest;
        });
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

  if (actors.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <GrCycle className="h-5 w-5" />
        Post-Cycle Actions
      </h3>

      <div className="rounded-md border">
        <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_20rem_10rem] gap-4 px-4 py-2 bg-muted border-b rounded-t-md text-sm font-medium">
          <span>Fighter</span>
          <span>Action</span>
          <span>Effect</span>
        </div>
        <ul>
          {actors.map((fighter) => {
            const row = rows[fighter.id];
            const done = resolved[fighter.id];
            const state = rowStates.get(fighter.id);
            const assignment = state?.assignment ?? null;
            const effect = done ? null : effectOf(assignment);
            const rowIssues = state?.issues ?? [];
            const target = row?.targetFighterId
              ? fighterById.get(row.targetFighterId)
              : undefined;
            // A patient is added to `resolved` by the escort's row, so `row`
            // alone is not enough to decide whether inputs still show.
            const pending = done ? undefined : row;
            const failure = pending ? failures[fighter.id] : undefined;

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
                  {done ? (
                    <p className="text-sm md:pt-2">
                      <span className="font-medium">
                        {POST_CYCLE_ACTIONS[done.action].label}
                      </span>
                      {done.outcome && (
                        <span className="text-muted-foreground"> — {done.outcome}</span>
                      )}
                    </p>
                  ) : (
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
                      dropdownPlacement="down"
                      clearable
                      disabled={!canEdit || applying}
                    />
                  )}

                  {pending?.action === 'medical_escort' && (
                    <Combobox
                      options={patientOptions(fighter.id, criticallyInjured)}
                      value={pending.targetFighterId ?? ''}
                      onValueChange={(id) => setRow(fighter.id, { targetFighterId: id || undefined })}
                      placeholder="Critically Injured fighter"
                      noResultsText="No fighter has a Critical Injury"
                      dropdownPlacement="down"
                      clearable
                      disabled={!canEdit || applying}
                    />
                  )}

                  {pending?.action === 'fit_bionics' && (
                    <>
                      <Combobox
                        options={patientOptions(fighter.id, injuredFighters)}
                        value={pending.targetFighterId ?? ''}
                        // Switching patient drops the injuries picked for the last one.
                        onValueChange={(id) =>
                          setRow(fighter.id, { targetFighterId: id || undefined, injuryIds: [] })
                        }
                        placeholder="Fighter to fit bionics"
                        noResultsText="No fighter has a removable Lasting Injury"
                        dropdownPlacement="down"
                        clearable
                        disabled={!canEdit || applying}
                      />
                      {target && (
                        <EffectChecklist
                          effects={removableLastingInjuriesOf(target)}
                          selected={pending.injuryIds}
                          costEach={FIT_BIONICS_COST_PER_INJURY}
                          onChange={(injuryIds) => setRow(fighter.id, { injuryIds })}
                          disabled={!canEdit || applying}
                          emptyText="No removable Lasting Injuries. A Critical Injury cannot be removed with bionics."
                        />
                      )}
                    </>
                  )}

                  {pending?.action === 'visit_chop_shop' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        fighterCardModals?.openVehicleDamageModal(fighter.id, { hideAddButton: true })
                      }
                      disabled={!canEdit || !fighterCardModals}
                    >
                      Repair Lasting Damage
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
    </div>
  );
}
