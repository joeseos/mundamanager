'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import Modal from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { GrCycle } from 'react-icons/gr';
import { LuMinus, LuPlus, LuWalletCards, LuWrench } from 'react-icons/lu';
import { FighterProps } from '@/types/fighter';
import type { FighterEffect } from '@/types/fighter-effect';
import { UserPermissions } from '@/types/user-permissions';
import { hasGangTacticsCards } from '@/types/edition';
import TacticsCardPickerModal from '@/components/gang/tactics-card-picker-modal';
import { useFighterCardModals } from '@/components/gang/fighter-card-modals-context';
import type { GangTacticsCard, TacticsCard } from '@/types/tactics-card';
import { getFighterSubtypeSortRank } from '@/utils/fighterSubtypeRank';
import { countsTowardRating } from '@/utils/fighter-status';
import {
  FIT_BIONICS_COST_PER_INJURY,
  MEDICAL_ESCORT_GOOD_STUFF_STEP,
  MEDICAL_ESCORT_MAX_USEFUL_STEPS,
  POST_CYCLE_ACTIONS,
  WORK_TERRITORY_MAX_FIGHTERS,
  assignmentCreditsDelta,
  eligiblePostCycleActions,
  hasCriticalInjury,
  medicalEscortOdds,
  postCycleTotalCredits,
  removableLastingInjuriesOf,
  validatePostCycleAssignments,
  type PostCycleActionId,
  type PostCycleAssignment,
} from '@/utils/postCycleActions';
import {
  applyPostCycleActions,
  type PostCycleActionOutcome,
  type PostCycleFighterChange,
} from '@/app/actions/post-cycle-actions';

interface PostCycleActionsProps {
  gangId: string;
  editionSlug?: string | null;
  fighters: FighterProps[];
  gangCredits: number;
  tacticsCards?: GangTacticsCard[];
  onTacticsCardsUpdate?: (cards: GangTacticsCard[]) => void;
  userPermissions?: UserPermissions;
  onFighterUpdate?: (fighter: FighterProps, skipRatingUpdate?: boolean) => void;
  onGangCreditsUpdate?: (credits: number) => void;
  onGangRatingUpdate?: (rating: number) => void;
  onGangWealthUpdate?: (wealth: number) => void;
}

/** A row may be half-filled, so it is not yet a PostCycleAssignment. */
interface RowState {
  action: PostCycleActionId;
  targetFighterId?: string;
  goodStuffSteps: number;
  declineToPay: boolean;
  injuryIds: string[];
  tacticsCards: TacticsCard[];
}

const emptyRow = (action: PostCycleActionId): RowState => ({
  action,
  goodStuffSteps: 0,
  declineToPay: false,
  injuryIds: [],
  tacticsCards: [],
});

/** What a half-filled row still needs, or null once it is a full assignment. */
function missingPick(row: RowState): string | null {
  switch (row.action) {
    case 'medical_escort':
      return row.targetFighterId ? null : 'Choose who to escort.';
    case 'fit_bionics':
      if (!row.targetFighterId) return 'Choose who gets the bionics.';
      return row.injuryIds.length > 0 ? null : 'Tick at least one injury to remove.';
    case 'develop_tactics':
      return row.tacticsCards.length > 0 ? null : 'Choose at least one Gang Tactic.';
    default:
      return null;
  }
}

function toAssignment(fighterId: string, row: RowState): PostCycleAssignment | null {
  if (missingPick(row)) return null;
  switch (row.action) {
    case 'medical_escort':
      return {
        fighterId,
        action: 'medical_escort',
        targetFighterId: row.targetFighterId!,
        goodStuffSteps: row.goodStuffSteps,
        declineToPay: row.declineToPay,
      };
    case 'fit_bionics':
      return {
        fighterId,
        action: 'fit_bionics',
        targetFighterId: row.targetFighterId!,
        injuryIds: row.injuryIds,
      };
    case 'develop_tactics':
      return {
        fighterId,
        action: 'develop_tactics',
        tacticsCardIds: row.tacticsCards.map((card) => card.id),
      };
    default:
      return { fighterId, action: row.action };
  }
}

const formatCredits = (delta: number) =>
  delta === 0 ? '—' : delta > 0 ? `+${delta}` : `${delta}`;

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

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

function CreditsDelta({ delta, className = '' }: { delta: number; className?: string }) {
  const tone =
    delta > 0
      ? 'text-green-600 font-medium'
      : delta < 0
        ? 'text-red-600 font-medium'
        : 'text-muted-foreground';
  return (
    <span className={`text-sm tabular-nums whitespace-nowrap ${tone} ${className}`}>
      {formatCredits(delta)}
    </span>
  );
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
          <span className="text-xs text-muted-foreground">{costEach}cr</span>
        </label>
      ))}
    </div>
  );
}

function MedicalEscortOptions({
  row,
  targetName,
  onChange,
  disabled,
}: {
  row: RowState;
  targetName: string;
  onChange: (next: Partial<RowState>) => void;
  disabled: boolean;
}) {
  const steps = row.goodStuffSteps;
  const odds = medicalEscortOdds(steps);
  const oddsParts = [
    { count: odds.Complications, label: 'dies', tone: 'text-red-600' },
    { count: odds.Stabilised, label: 'Lasting Injury', tone: 'text-amber-600' },
    { count: odds['Full Recovery'], label: 'full recovery', tone: 'text-green-600' },
  ].filter((part) => part.count > 0);

  return (
    <div className="rounded-md border px-3 py-2 space-y-2 text-xs">
      {!row.declineToPay && (
        <>
          <div className="flex items-center justify-between gap-2">
            <span>
              &quot;Good Stuff&quot;
              <span className="text-muted-foreground">
                {' '}
                · {MEDICAL_ESCORT_GOOD_STUFF_STEP}cr per +1
              </span>
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                aria-label="Less Good Stuff"
                onClick={() => onChange({ goodStuffSteps: steps - 1 })}
                disabled={disabled || steps === 0}
              >
                <LuMinus className="h-3 w-3" />
              </Button>
              <span className="w-7 text-center tabular-nums">+{steps}</span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                aria-label="More Good Stuff"
                onClick={() => onChange({ goodStuffSteps: steps + 1 })}
                disabled={disabled || steps >= MEDICAL_ESCORT_MAX_USEFUL_STEPS}
              >
                <LuPlus className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <p className="text-muted-foreground">
            On the D6:{' '}
            {oddsParts.map((part, index) => (
              <span key={part.label}>
                {index > 0 && ' · '}
                <span className={part.tone}>
                  {part.count}/6 {part.label}
                </span>
              </span>
            ))}
          </p>
        </>
      )}
      <label
        className={`flex items-center gap-2 text-muted-foreground ${
          disabled ? '' : 'cursor-pointer'
        }`}
      >
        <Checkbox
          checked={row.declineToPay}
          onCheckedChange={(checked) => onChange({ declineToPay: checked === true })}
          disabled={disabled}
        />
        Refuse to pay: {targetName} dies, no roll
      </label>
    </div>
  );
}

export default function PostCycleActions({
  gangId,
  editionSlug,
  fighters,
  gangCredits,
  tacticsCards,
  onTacticsCardsUpdate,
  userPermissions,
  onFighterUpdate,
  onGangCreditsUpdate,
  onGangRatingUpdate,
  onGangWealthUpdate,
}: PostCycleActionsProps) {
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [tacticsPickerFighterId, setTacticsPickerFighterId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [report, setReport] = useState<{
    outcomes: PostCycleActionOutcome[];
    partial: boolean;
  } | null>(null);

  const canEdit = userPermissions?.canEdit ?? false;
  const fighterCardModals = useFighterCardModals();
  const availability = useMemo(
    () => ({ tacticsCardsAvailable: hasGangTacticsCards(editionSlug) }),
    [editionSlug]
  );
  const ownedTacticsCardIds = useMemo(
    () => new Set((tacticsCards ?? []).map((card) => card.tactics_cards_id)),
    [tacticsCards]
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

  /** Patient id -> the fighter taking them to the Doc. */
  const doctorVisits = useMemo(() => {
    const visits = new Map<string, string>();
    for (const [fighterId, row] of Object.entries(rows)) {
      if (
        (row.action === 'medical_escort' || row.action === 'fit_bionics') &&
        row.targetFighterId
      ) {
        visits.set(row.targetFighterId, fighterId);
      }
    }
    return visits;
  }, [rows]);

  const assignments = useMemo(
    () =>
      Object.entries(rows)
        .map(([fighterId, row]) => toAssignment(fighterId, row))
        .filter((a): a is PostCycleAssignment => a !== null),
    [rows]
  );
  const incompleteCount = Object.values(rows).filter((row) => missingPick(row)).length;

  const issues = useMemo(
    () =>
      validatePostCycleAssignments(fighters, assignments, {
        ...availability,
        ownedTacticsCardIds,
      }),
    [fighters, assignments, availability, ownedTacticsCardIds]
  );

  // Issues about a fighter without a row (a patient in Recovery) go under the list.
  const { issuesByFighter, sheetIssues } = useMemo(() => {
    const byFighter = new Map<string, string[]>();
    const rest: string[] = [];
    for (const issue of issues) {
      if (issue.fighterId && actorIds.has(issue.fighterId)) {
        byFighter.set(issue.fighterId, [
          ...(byFighter.get(issue.fighterId) ?? []),
          issue.message,
        ]);
      } else {
        rest.push(issue.message);
      }
    }
    return { issuesByFighter: byFighter, sheetIssues: rest };
  }, [issues, actorIds]);

  const totalCost = -postCycleTotalCredits(assignments);
  const creditsAfter = gangCredits - totalCost;
  const canAfford = creditsAfter >= 0;
  const workTerritoryCount = assignments.filter((a) => a.action === 'work_territory').length;

  const blockedReason =
    incompleteCount > 0
      ? `Finish or clear ${plural(incompleteCount, 'incomplete action')} first.`
      : issues.length > 0
        ? 'Fix the problems above first.'
        : !canAfford
          ? 'The gang cannot afford these actions.'
          : null;

  const unassigned = actors.filter((f) => !rows[f.id] && !doctorVisits.has(f.id));

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

  const trainTheRest = () =>
    setRows((prev) => {
      const next = { ...prev };
      for (const fighter of unassigned) next[fighter.id] = emptyRow('train');
      return next;
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
        const escortId = doctorVisits.get(f.id);
        const reason =
          escortId && escortId !== performerId
            ? `with ${fighterById.get(escortId)?.fighter_name ?? 'another fighter'}`
            : rows[f.id]
              ? 'has an action'
              : null;
        return {
          value: f.id,
          label: reason ? (
            <span className="text-muted-foreground">
              {f.fighter_name}
              <span className="ml-2 text-xs">{reason}</span>
            </span>
          ) : (
            f.fighter_name
          ),
          displayValue: f.fighter_name,
          disabled: reason !== null,
        };
      });

  const handleApply = async (): Promise<boolean> => {
    if (isApplying) return false;
    setIsApplying(true);

    try {
      const result = await applyPostCycleActions({ gangId, assignments });
      const applied = result.results;

      // skipRatingUpdate: the authoritative rating arrives below.
      const patched = new Map<string, FighterProps>();
      for (const outcome of applied) {
        for (const change of outcome.changes ?? []) {
          const current = patched.get(change.fighterId) ?? fighterById.get(change.fighterId);
          if (current) patched.set(change.fighterId, applyChange(current, change));
        }
      }
      for (const fighter of patched.values()) {
        onFighterUpdate?.(fighter, true);
      }

      const addedCards = applied.flatMap((r) => r.addedTacticsCards ?? []);
      if (addedCards.length > 0 && onTacticsCardsUpdate) {
        const byId = new Map((tacticsCards ?? []).map((card) => [card.id, card]));
        addedCards.forEach((card) => byId.set(card.id, card));
        onTacticsCardsUpdate(Array.from(byId.values()));
      }

      if (result.gang) {
        onGangCreditsUpdate?.(result.gang.credits);
        onGangRatingUpdate?.(result.gang.rating);
        onGangWealthUpdate?.(result.gang.wealth);
      }

      if (applied.length > 0) {
        setRows((prev) => {
          const next = { ...prev };
          for (const outcome of applied) {
            if (!outcome.failed) delete next[outcome.fighterId];
          }
          return next;
        });
      }

      if (!result.success) {
        if (applied.length > 0) setReport({ outcomes: applied, partial: true });
        toast.error(result.error || 'Failed to apply Post-cycle Actions');
        return applied.length > 0;
      }

      // Server-side rolls aren't visible anywhere else, so they get the report.
      if (applied.some((outcome) => outcome.roll)) {
        setReport({ outcomes: applied, partial: false });
      } else {
        toast.success(`Resolved ${plural(applied.length, 'Post-cycle Action')}`);
      }
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to apply Post-cycle Actions'
      );
      return false;
    } finally {
      setIsApplying(false);
    }
  };

  if (actors.length === 0) return null;

  const tacticsPickerRow = tacticsPickerFighterId ? rows[tacticsPickerFighterId] : undefined;

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <GrCycle className="h-5 w-5" />
          Post-Cycle Actions
        </h3>
        {canEdit && (
          <div className="flex items-center gap-2">
            {unassigned.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={trainTheRest}
                title="Give every fighter without an action the Train action"
              >
                Train the rest
              </Button>
            )}
            {Object.keys(rows).length > 0 && (
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setRows({})}>
                Clear
              </Button>
            )}
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Each fighter may take one action between battles, then the whole sequence is
        resolved at once. Fighters in Recovery, captured or dead sit it out.
      </p>

      <div className="rounded-md border">
        <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_20rem_4rem] gap-4 px-4 py-2 bg-muted border-b rounded-t-md text-sm font-medium">
          <span>Fighter</span>
          <span>Action</span>
          <span className="text-right">Credits</span>
        </div>
        <ul>
          {actors.map((fighter) => {
            const row = rows[fighter.id];
            const assignment = row ? toAssignment(fighter.id, row) : null;
            const delta = assignment ? assignmentCreditsDelta(assignment) : 0;
            const hint = row ? missingPick(row) : null;
            const rowIssues = issuesByFighter.get(fighter.id) ?? [];
            const escortId = doctorVisits.get(fighter.id);
            const target = row?.targetFighterId
              ? fighterById.get(row.targetFighterId)
              : undefined;

            return (
              <li
                key={fighter.id}
                className="border-b last:border-0 px-4 py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_20rem_4rem] sm:gap-4 sm:items-start"
              >
                <div className="flex items-start justify-between gap-3 mb-2 sm:mb-0 sm:pt-2 min-w-0">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{fighter.fighter_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {fighter.fighter_type}
                      {fighter.fighter_subtypes?.length
                        ? ` — ${fighter.fighter_subtypes.join(', ')}`
                        : ''}
                    </div>
                  </div>
                  <CreditsDelta delta={delta} className="sm:hidden" />
                </div>

                <div className="space-y-2 min-w-0">
                  {escortId && !row ? (
                    <p className="text-sm text-muted-foreground sm:pt-2">
                      Going to the Doc with {fighterById.get(escortId)?.fighter_name}, so
                      takes no action.
                    </p>
                  ) : (
                    <Combobox
                      options={eligiblePostCycleActions(fighter, availability).map((option) => {
                        const reason = unavailableReason(fighter, option.id);
                        return {
                          value: option.id,
                          label: (
                            <span
                              title={option.description}
                              className={reason ? 'text-muted-foreground' : undefined}
                            >
                              {option.label}
                              <span className="ml-2 text-xs text-muted-foreground">
                                {reason ?? option.summary}
                              </span>
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

                  {row?.action === 'medical_escort' && (
                    <>
                      <Combobox
                        options={patientOptions(fighter.id, criticallyInjured)}
                        value={row.targetFighterId ?? ''}
                        onValueChange={(value) =>
                          setRow(fighter.id, { targetFighterId: value || undefined })
                        }
                        placeholder="Critically Injured fighter"
                        noResultsText="No fighter has a Critical Injury"
                        dropdownPlacement="down"
                        clearable
                        disabled={!canEdit}
                      />
                      {target && (
                        <MedicalEscortOptions
                          row={row}
                          targetName={target.fighter_name}
                          onChange={(next) => setRow(fighter.id, next)}
                          disabled={!canEdit}
                        />
                      )}
                    </>
                  )}

                  {row?.action === 'fit_bionics' && (
                    <>
                      <Combobox
                        options={patientOptions(fighter.id, injuredFighters)}
                        value={row.targetFighterId ?? ''}
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
                          selected={row.injuryIds}
                          costEach={FIT_BIONICS_COST_PER_INJURY}
                          onChange={(injuryIds) => setRow(fighter.id, { injuryIds })}
                          disabled={!canEdit}
                          emptyText="No removable Lasting Injuries. A Critical Injury cannot be removed with bionics."
                        />
                      )}
                    </>
                  )}

                  {row?.action === 'visit_chop_shop' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => fighterCardModals?.openVehicleDamageModal(fighter.id)}
                      disabled={!canEdit || !fighterCardModals}
                    >
                      <LuWrench className="h-4 w-4" />
                      Repair Lasting Damage
                    </Button>
                  )}

                  {row?.action === 'develop_tactics' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2"
                        onClick={() => setTacticsPickerFighterId(fighter.id)}
                        disabled={!canEdit}
                      >
                        <LuWalletCards className="h-4 w-4" />
                        {row.tacticsCards.length > 0 ? 'Change Gang Tactics' : 'Choose Gang Tactics'}
                      </Button>
                      {row.tacticsCards.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {row.tacticsCards.map((card) => (
                            <Badge key={card.id} variant="outline" className="font-normal">
                              {card.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {row?.action === 'visit_trading_post' && (
                    <p className="text-xs text-muted-foreground">
                      Logged only. Buy anything the gang finds from the Stash tab.
                    </p>
                  )}

                  {hint && <p className="text-xs text-amber-600">{hint}</p>}
                  {rowIssues.map((message) => (
                    <p key={message} className="text-xs text-red-600">
                      {message}
                    </p>
                  ))}
                </div>

                <CreditsDelta delta={delta} className="hidden sm:block text-right sm:pt-2" />
              </li>
            );
          })}
        </ul>
      </div>

      {sheetIssues.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-red-600">
          {sheetIssues.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      <div className="border-t mt-4 pt-4 space-y-3">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Assigned</span>
            <span className="font-semibold">
              {assignments.length} of {actors.length}
              {workTerritoryCount > 0 && (
                <span className="font-normal text-muted-foreground">
                  {' '}
                  · {workTerritoryCount}/{WORK_TERRITORY_MAX_FIGHTERS} working Territory
                </span>
              )}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {totalCost >= 0 ? 'Total cost' : 'Total gained'}
            </span>
            <span className="font-semibold">{Math.abs(totalCost)} credits</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Credits after</span>
            <span className={`font-semibold ${canAfford ? '' : 'text-red-500'}`}>
              {creditsAfter}
            </span>
          </div>
        </div>
        <Button
          className="w-full"
          onClick={() => setIsConfirming(true)}
          disabled={!canEdit || isApplying || assignments.length === 0 || blockedReason !== null}
        >
          Resolve {plural(assignments.length, 'Post-Cycle Action')}
        </Button>
        {canEdit && blockedReason && (
          <p className="text-xs text-center text-muted-foreground">{blockedReason}</p>
        )}
      </div>

      {tacticsPickerFighterId && tacticsPickerRow && (
        <TacticsCardPickerModal
          gangId={gangId}
          ownedCardIds={ownedTacticsCardIds}
          // Cards another row claimed; the insert would silently drop a duplicate.
          reservedCardIds={
            new Set(
              Object.entries(rows)
                .filter(([fighterId]) => fighterId !== tacticsPickerFighterId)
                .flatMap(([, other]) => other.tacticsCards.map((card) => card.id))
            )
          }
          initialSelectedIds={tacticsPickerRow.tacticsCards.map((card) => card.id)}
          title="Develop Tactics"
          helper={`${
            fighterById.get(tacticsPickerFighterId)?.fighter_name ?? ''
          } — added to the roster when the sequence resolves.`}
          confirmText="Done"
          onConfirm={(_cardIds, cards) => {
            setRow(tacticsPickerFighterId, { tacticsCards: cards });
            setTacticsPickerFighterId(null);
            return true;
          }}
          onClose={() => setTacticsPickerFighterId(null)}
        />
      )}

      {isConfirming && (
        <Modal
          title="Resolve Post-Cycle Sequence"
          onClose={() => setIsConfirming(false)}
          onConfirm={handleApply}
          confirmText={isApplying ? 'Resolving…' : 'Resolve'}
          confirmDisabled={isApplying}
        >
          <p>
            Resolve {plural(assignments.length, 'Post-cycle Action')}? The gang{' '}
            {totalCost >= 0 ? 'spends' : 'gains'} {Math.abs(totalCost)} credits. This cannot
            be undone.
          </p>
        </Modal>
      )}

      {report && (
        <Modal
          title={
            report.partial
              ? 'Some Post-Cycle Actions Could Not Be Applied'
              : 'Post-Cycle Sequence Resolved'
          }
          helper={
            report.partial
              ? 'The rest were applied and have been logged.'
              : 'Every action was applied and logged.'
          }
          onClose={() => setReport(null)}
          onConfirm={() => setReport(null)}
          confirmText="Done"
          hideCancel
          width="lg"
        >
          <div className="space-y-2">
            {report.outcomes.map((outcome) => (
              <div
                key={`${outcome.fighterId}-${outcome.action}`}
                className="p-2 bg-muted rounded-md"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{outcome.fighterName}</span>
                  <Badge variant="outline" className="font-normal">
                    {POST_CYCLE_ACTIONS[outcome.action].label}
                  </Badge>
                  {outcome.roll && (
                    <Badge variant="secondary" className="font-normal">
                      Roll {outcome.roll.total}
                    </Badge>
                  )}
                  {outcome.failed && <Badge variant="destructive">Failed</Badge>}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{outcome.outcome}</p>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
