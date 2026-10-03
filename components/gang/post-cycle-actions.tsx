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
import { hasGangTacticsCards } from '@/types/edition';
import { useFighterCardModals } from '@/components/gang/fighter-card-modals-context';
import { getFighterSubtypeSortRank } from '@/utils/fighterSubtypeRank';
import { formatFighterSubtypeDisplay } from '@/utils/fighterSubtypeDisplay';
import { countsTowardRating } from '@/utils/fighter-status';
import {
  FIT_BIONICS_COST_PER_INJURY,
  POST_CYCLE_ACTIONS,
  TRAIN_XP,
  WORK_TERRITORY_MAX_FIGHTERS,
  assignmentCreditsDelta,
  eligiblePostCycleActions,
  hasCriticalInjury,
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

const emptyRow = (action: PostCycleActionId): RowState => ({
  action,
  injuryIds: [],
});

/** Whether a row still lacks a pick its action needs. */
function isIncomplete(row: RowState): boolean {
  switch (row.action) {
    case 'medical_escort':
      return !row.targetFighterId;
    case 'fit_bionics':
      return !row.targetFighterId || row.injuryIds.length === 0;
    default:
      return false;
  }
}

function toAssignment(fighterId: string, row: RowState): PostCycleAssignment | null {
  if (isIncomplete(row)) return null;
  switch (row.action) {
    case 'medical_escort':
      return {
        fighterId,
        action: 'medical_escort',
        targetFighterId: row.targetFighterId!,
      };
    case 'fit_bionics':
      return {
        fighterId,
        action: 'fit_bionics',
        targetFighterId: row.targetFighterId!,
        injuryIds: row.injuryIds,
      };
    default:
      return { fighterId, action: row.action };
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
  userPermissions,
  onFighterUpdate,
  onGangFinancialsUpdate,
}: PostCycleActionsProps) {
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [resolvingFighterId, setResolvingFighterId] = useState<string | null>(null);
  /**
   * What each fighter already did this sequence. The two rules a single server
   * call cannot see — one action per fighter, and the five Work Territory slots
   * — are held here; everything else is enforced by the saved state each
   * resolved action leaves behind.
   */
  const [resolved, setResolved] = useState<
    Record<string, { action: PostCycleActionId; outcome: string }>
  >({});

  const canEdit = userPermissions?.canEdit ?? false;
  const fighterCardModals = useFighterCardModals();
  const availability = useMemo(
    () => ({ tacticsCardsAvailable: hasGangTacticsCards(editionSlug) }),
    [editionSlug]
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

  /** One validated assignment per pending row, keyed by the fighter resolving it. */
  const rowStates = useMemo(() => {
    const states = new Map<
      string,
      { assignment: PostCycleAssignment | null; issues: string[]; cost: number }
    >();

    for (const [fighterId, row] of activeRows) {
      const assignment = toAssignment(fighterId, row);
      const issues = assignment
        ? validatePostCycleAssignment(fighters, assignment, availability).map(
            (issue) => issue.message
          )
        : [];

      // The server cannot see this: after one Fit Bionics the patient still has
      // other injuries, so a second row targeting them would pass validation.
      const patientId =
        assignment &&
        (assignment.action === 'medical_escort' || assignment.action === 'fit_bionics')
          ? assignment.targetFighterId
          : null;
      if (patientId && resolved[patientId]) {
        issues.push(
          `${fighterById.get(patientId)?.fighter_name ?? 'That fighter'} has already been to the Doc.`
        );
      }
      states.set(fighterId, {
        assignment,
        issues,
        cost: assignment ? -assignmentCreditsDelta(assignment) : 0,
      });
    }
    return states;
  }, [activeRows, fighters, availability, resolved, fighterById]);

  // Both halves count: five is the cap for the whole sequence, so rows still
  // waiting to resolve take slots just as resolved ones do.
  const workTerritoryCount = useMemo(
    () =>
      Object.values(resolved).filter((done) => done.action === 'work_territory').length +
      [...activeRows.values()].filter((row) => row.action === 'work_territory').length,
    [resolved, activeRows]
  );

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
      return { ...prev, [fighterId]: emptyRow(value as PostCycleActionId) };
    });

  const unavailableReason = (fighter: FighterProps, actionId: PostCycleActionId) => {
    switch (actionId) {
      case 'medical_escort':
        return criticallyInjured.some((f) => f.id !== fighter.id)
          ? null
          : 'No Critical Injuries';
      case 'fit_bionics':
        return injuredFighters.some((f) => f.id !== fighter.id) ? null : 'No Lasting Injuries';
      case 'work_territory':
        return workTerritoryCount >= WORK_TERRITORY_MAX_FIGHTERS &&
          rows[fighter.id]?.action !== 'work_territory'
          ? `All ${WORK_TERRITORY_MAX_FIGHTERS} taken`
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
  const effectOf = (assignment: PostCycleAssignment | null, row?: RowState) => {
    if (!assignment) return null;
    if (assignment.action === 'train') return `+${TRAIN_XP} XP`;
    const delta = assignmentCreditsDelta(assignment);
    return delta === 0 ? null : `${delta > 0 ? '+' : ''}${delta} credits`;
  };

  const handleResolve = async (fighterId: string) => {
    const state = rowStates.get(fighterId);
    if (!state?.assignment || resolvingFighterId) return;

    setResolvingFighterId(fighterId);
    try {
      const result = await resolvePostCycleAction({
        gangId,
        assignment: state.assignment,
      });
      const outcome = result.outcome;

      // skipRatingUpdate: the authoritative rating arrives with the gang below.
      for (const change of outcome?.changes ?? []) {
        const current = fighterById.get(change.fighterId);
        if (current) onFighterUpdate?.(applyChange(current, change), true);
      }


      if (result.gang) onGangFinancialsUpdate?.(result.gang);

      if (!result.success) {
        toast.error(result.error || 'Failed to resolve the action');
        return;
      }

      const patientId =
        state.assignment.action === 'medical_escort' ||
        state.assignment.action === 'fit_bionics'
          ? state.assignment.targetFighterId
          : null;

      // The row is done: record what happened and drop its inputs.
      if (outcome) {
        setResolved((prev) => ({
          ...prev,
          [fighterId]: { action: outcome.action, outcome: outcome.outcome },
          // A fighter taken to the Doc spends no action of their own. Most are
          // dead or in Recovery afterwards and drop out anyway, but a Fit
          // Bionics patient is still on their feet.
          ...(patientId
            ? {
                [patientId]: {
                  action: outcome.action,
                  outcome: `Taken to the Doc by ${outcome.fighterName}.`,
                },
              }
            : {}),
        }));
      }
      setRows((prev) => {
        const next = { ...prev };
        delete next[fighterId];
        // The patient spends no action, so whatever they had queued goes with it.
        if (patientId) delete next[patientId];
        return next;
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to resolve the action'
      );
    } finally {
      setResolvingFighterId(null);
    }
  };

  if (actors.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold mb-4 flex items-center justify-between flex-wrap gap-2">
        <span className="flex items-center gap-2">
          <GrCycle className="h-5 w-5" />
          Post-Cycle Actions
        </span>
        <span className="text-xs font-normal text-muted-foreground">
          {actors.filter((f) => resolved[f.id]).length} of {actors.length} resolved
        </span>
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
            const effect = done ? null : effectOf(assignment, row);
            const rowIssues = state?.issues ?? [];
            const target = row?.targetFighterId
              ? fighterById.get(row.targetFighterId)
              : undefined;
            const isResolving = resolvingFighterId === fighter.id;
            // A patient is added to `resolved` by the escort's row, so `row`
            // alone is not enough to decide whether inputs still show.
            const pending = done ? undefined : row;
            const cannotAfford = (state?.cost ?? 0) > gangCredits;

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
                      disabled={!canEdit}
                    />
                  )}

                  {pending?.action === 'medical_escort' && (
                    <>
                      <Combobox
                        options={patientOptions(fighter.id, criticallyInjured)}
                        value={pending.targetFighterId ?? ''}
                        onValueChange={(value) =>
                          setRow(fighter.id, { targetFighterId: value || undefined })
                        }
                        placeholder="Critically Injured fighter"
                        noResultsText="No fighter has a Critical Injury"
                        dropdownPlacement="down"
                        clearable
                        disabled={!canEdit}
                      />
                    </>
                  )}

                  {pending?.action === 'fit_bionics' && (
                    <>
                      <Combobox
                        options={patientOptions(fighter.id, injuredFighters)}
                        value={pending.targetFighterId ?? ''}
                        onValueChange={(value) =>
                          setRow(fighter.id, { targetFighterId: value || undefined, injuryIds: [] })
                        }
                        placeholder="Fighter to fit bionics"
                        noResultsText="No fighter has a removable Lasting Injury"
                        dropdownPlacement="down"
                        clearable
                        disabled={!canEdit}
                      />
                      {target && (
                        <EffectChecklist
                          effects={removableLastingInjuriesOf(target)}
                          selected={pending.injuryIds}
                          costEach={FIT_BIONICS_COST_PER_INJURY}
                          onChange={(injuryIds) => setRow(fighter.id, { injuryIds })}
                          disabled={!canEdit}
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
                        fighterCardModals?.openVehicleDamageModal(fighter.id)
                      }
                      disabled={!canEdit || !fighterCardModals}
                    >
                      Repair Lasting Damage
                    </Button>
                  )}


                  {rowIssues.map((message) => (
                    <p key={message} className="text-xs text-red-600">
                      {message}
                    </p>
                  ))}

                  {pending && (
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => handleResolve(fighter.id)}
                      disabled={
                        !canEdit ||
                        isResolving ||
                        resolvingFighterId !== null ||
                        !assignment ||
                        rowIssues.length > 0 ||
                        cannotAfford
                      }
                    >
                      {isResolving ? 'Resolving…' : 'Resolve'}
                    </Button>
                  )}
                  {pending && cannotAfford && rowIssues.length === 0 && (
                    <p className="text-xs text-red-600">
                      The gang cannot afford this action.
                    </p>
                  )}
                </div>

                <span className="hidden md:block md:pt-2">{effect}</span>
              </li>
            );
          })}
        </ul>
      </div>


    </div>
  );
}
