'use client';

/**
 * The N26 Post-cycle Sequence panel, shown on the gang page's Campaign tab.
 *
 * The player assigns one Post-cycle Action per fighter, then confirms once and
 * the whole sequence is applied server-side. Nothing is persisted between
 * visits — the assignment sheet lives in component state until it is applied.
 *
 * Every rule (who may perform what, what it costs, the cross-fighter caps) comes
 * from utils/postCycleActions.ts, which the server action re-runs on its own
 * reads. This component only builds the form and reports the outcome.
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import Modal from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { GrCycle } from 'react-icons/gr';
import { LuWalletCards, LuWrench } from 'react-icons/lu';
import { FaMedkit } from 'react-icons/fa';
import { FighterProps } from '@/types/fighter';
import { UserPermissions } from '@/types/user-permissions';
import { EDITION_N26, hasGangTacticsCards } from '@/types/edition';
import TacticsCardPickerModal from '@/components/gang/tactics-card-picker-modal';
import type { GangTacticsCard } from '@/types/tactics-card';
import { getFighterSubtypeSortRank } from '@/utils/fighterSubtypeRank';
import {
  FIT_BIONICS_COST_PER_INJURY,
  MEDICAL_ESCORT_COST,
  MEDICAL_ESCORT_GOOD_STUFF_STEP,
  POST_CYCLE_ACTIONS,
  WORK_TERRITORY_MAX_FIGHTERS,
  assignmentCreditsDelta,
  chopShopCostPerDamage,
  eligiblePostCycleActions,
  hasCriticalInjury,
  lastingDamagesOf,
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
  /** The gang's current Gang Tactics, so Develop Tactics cannot re-add one. */
  tacticsCards?: GangTacticsCard[];
  onTacticsCardsUpdate?: (cards: GangTacticsCard[]) => void;
  userPermissions?: UserPermissions;
  onFighterUpdate?: (fighter: FighterProps, skipRatingUpdate?: boolean) => void;
  onGangCreditsUpdate?: (credits: number) => void;
  onGangRatingUpdate?: (rating: number) => void;
  onGangWealthUpdate?: (wealth: number) => void;
}

/**
 * Per-row form state. Kept separate from PostCycleAssignment so a half-filled
 * row (an action chosen but no target yet) is representable without being a
 * valid assignment.
 */
interface RowState {
  action: PostCycleActionId;
  targetFighterId?: string;
  goodStuffSteps: number;
  declineToPay: boolean;
  injuryIds: string[];
  damageIds: string[];
  tacticsCardIds: string[];
}

const emptyRow = (action: PostCycleActionId): RowState => ({
  action,
  goodStuffSteps: 0,
  declineToPay: false,
  injuryIds: [],
  damageIds: [],
  tacticsCardIds: [],
});

/** A row becomes an assignment only once its required picks are made. */
function toAssignment(fighterId: string, row: RowState): PostCycleAssignment | null {
  switch (row.action) {
    case 'medical_escort':
      return row.targetFighterId
        ? {
            fighterId,
            action: 'medical_escort',
            targetFighterId: row.targetFighterId,
            goodStuffSteps: row.goodStuffSteps,
            declineToPay: row.declineToPay,
          }
        : null;
    case 'fit_bionics':
      return row.targetFighterId && row.injuryIds.length > 0
        ? {
            fighterId,
            action: 'fit_bionics',
            targetFighterId: row.targetFighterId,
            injuryIds: row.injuryIds,
          }
        : null;
    case 'visit_chop_shop':
      return row.damageIds.length > 0
        ? { fighterId, action: 'visit_chop_shop', damageIds: row.damageIds }
        : null;
    case 'develop_tactics':
      return row.tacticsCardIds.length > 0
        ? { fighterId, action: 'develop_tactics', tacticsCardIds: row.tacticsCardIds }
        : null;
    default:
      return { fighterId, action: row.action };
  }
}

const formatCredits = (delta: number) =>
  delta === 0 ? '—' : delta > 0 ? `+${delta}` : `${delta}`;

/**
 * Apply one server-reported change to a fighter.
 *
 * The gang page holds its fighters in `useState`, so a `router.refresh()` would
 * not reach them — the server hands back exactly what it altered and this
 * replays it. Rating and wealth are deliberately not touched here: they come
 * back authoritative on the response, so the caller passes `skipRatingUpdate`.
 */
function applyChange(fighter: FighterProps, change: PostCycleFighterChange): FighterProps {
  const next: FighterProps = { ...fighter };

  if (change.removedEffectIds?.length || change.addedInjury) {
    const bucket = change.removedFrom ?? 'injuries';
    const existing = next.effects?.[bucket] ?? [];
    const removed = new Set(change.removedEffectIds ?? []);
    const kept = existing.filter((effect) => !removed.has(effect.id));

    next.effects = {
      ...next.effects,
      [bucket]:
        change.addedInjury && bucket === 'injuries'
          ? [...kept, change.addedInjury as (typeof kept)[number]]
          : kept,
    };
  }

  if (change.killed !== undefined) next.killed = change.killed;
  if (change.recovery !== undefined) next.recovery = change.recovery;
  if (change.xpDelta) next.xp = (next.xp ?? 0) + change.xpDelta;

  return next;
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
  const [effectPicker, setEffectPicker] = useState<{
    fighterId: string;
    kind: 'injuries' | 'damages';
  } | null>(null);
  const [tacticsPickerFighterId, setTacticsPickerFighterId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [outcomes, setOutcomes] = useState<PostCycleActionOutcome[] | null>(null);

  const canEdit = userPermissions?.canEdit ?? false;
  const availability = useMemo(
    () => ({ tacticsCardsAvailable: hasGangTacticsCards(editionSlug) }),
    [editionSlug]
  );
  const ownedTacticsCardIds = useMemo(
    () => new Set((tacticsCards ?? []).map((card) => card.tactics_cards_id)),
    [tacticsCards]
  );

  // Fighters that could take at least one action, Leaders and Champions first.
  const actors = useMemo(
    () =>
      fighters
        .filter((f) => eligiblePostCycleActions(f, availability).length > 0)
        .sort(
          (a, b) =>
            getFighterSubtypeSortRank(a.fighter_subtypes, EDITION_N26) -
              getFighterSubtypeSortRank(b.fighter_subtypes, EDITION_N26) ||
            a.fighter_name.localeCompare(b.fighter_name)
        ),
    [fighters, availability]
  );

  const criticallyInjured = useMemo(
    () => fighters.filter((f) => hasCriticalInjury(f)),
    [fighters]
  );

  const injuredFighters = useMemo(
    () => fighters.filter((f) => removableLastingInjuriesOf(f).length > 0),
    [fighters]
  );

  const assignments = useMemo(
    () =>
      Object.entries(rows)
        .map(([fighterId, row]) => toAssignment(fighterId, row))
        .filter((a): a is PostCycleAssignment => a !== null),
    [rows]
  );

  const issues = useMemo(
    () =>
      validatePostCycleAssignments(fighters, assignments, {
        ...availability,
        ownedTacticsCardIds,
      }),
    [fighters, assignments, availability, ownedTacticsCardIds]
  );

  const totalCost = useMemo(
    () => -postCycleTotalCredits(assignments),
    [assignments]
  );
  const creditsAfter = gangCredits - totalCost;
  const canAfford = creditsAfter >= 0;

  const workTerritoryCount = assignments.filter(
    (a) => a.action === 'work_territory'
  ).length;

  const setRow = (fighterId: string, next: Partial<RowState> | null) =>
    setRows((prev) => {
      if (next === null) {
        const { [fighterId]: _removed, ...rest } = prev;
        return rest;
      }
      const current = prev[fighterId] ?? emptyRow(next.action ?? 'train');
      return { ...prev, [fighterId]: { ...current, ...next } };
    });

  const handleActionChange = (fighterId: string, value: string) => {
    if (!value) return setRow(fighterId, null);
    // Changing the action clears the previous action's picks.
    setRows((prev) => ({ ...prev, [fighterId]: emptyRow(value as PostCycleActionId) }));
  };

  const handleApply = async (): Promise<boolean> => {
    if (isApplying) return false;
    setIsApplying(true);

    try {
      const result = await applyPostCycleActions({ gangId, assignments });

      // Replay exactly what the server changed onto the gang page's own fighter
      // state. `skipRatingUpdate` because the authoritative rating arrives below.
      const patched = new Map<string, FighterProps>();
      for (const applied of result.results) {
        for (const change of applied.changes ?? []) {
          const current =
            patched.get(change.fighterId) ??
            fighters.find((f) => f.id === change.fighterId);
          if (current) patched.set(change.fighterId, applyChange(current, change));
        }
      }
      for (const fighter of patched.values()) {
        onFighterUpdate?.(fighter, true);
      }

      // Newly added Gang Tactics live on the page, not on a fighter, so they are
      // merged separately. addGangTacticsCards returns only rows it inserted.
      const addedCards = result.results.flatMap((r) => r.addedTacticsCards ?? []);
      if (addedCards.length > 0 && onTacticsCardsUpdate) {
        const byId = new Map((tacticsCards ?? []).map((card) => [card.id, card]));
        addedCards.forEach((card) => byId.set(card.id, card));
        onTacticsCardsUpdate(Array.from(byId.values()));
      }

      // The gang numbers come back authoritative — several of these actions move
      // rating and wealth as well as credits, so nothing is guessed client-side.
      if (result.gang) {
        onGangCreditsUpdate?.(result.gang.credits);
        onGangRatingUpdate?.(result.gang.rating);
        onGangWealthUpdate?.(result.gang.wealth);
      }

      if (!result.success) {
        // Only a partial application needs a modal: it is the one case where the
        // player has to know which fighters did not get their action.
        if (result.results.length > 0) {
          setOutcomes(result.results);
        }
        toast.error(result.error || 'Failed to apply Post-cycle Actions');
        // A partial application still clears the rows it managed to apply.
        if (result.results.length > 0) {
          setRows((prev) => {
            const next = { ...prev };
            for (const applied of result.results) {
              if (!applied.failed) delete next[applied.fighterId];
            }
            return next;
          });
        }
        return result.results.length > 0;
      }

      // Server-rolled results are the one thing the player cannot read off the
      // page afterwards, so they ride along on the toast rather than costing a
      // modal. Everything else is already visible on the fighter cards.
      const rolled = result.results.filter((r) => r.roll);

      toast.success(
        `Applied ${result.results.length} Post-cycle Action${
          result.results.length === 1 ? '' : 's'
        }`,
        rolled.length > 0
          ? { description: rolled.map((r) => r.outcome).join('\n') }
          : undefined
      );
      setRows({});
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

  const pickerFighter = effectPicker
    ? fighters.find((f) => f.id === effectPicker.fighterId)
    : undefined;

  return (
    <div className="mt-8">
      <h3 className="text-lg font-semibold mb-4 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <GrCycle className="h-5 w-5" />
          Post-Cycle Actions
        </div>
        {assignments.length > 0 && (
          <span className="text-xs font-normal text-muted-foreground">
            {assignments.length} assigned
            {workTerritoryCount > 0 &&
              ` · ${workTerritoryCount}/${WORK_TERRITORY_MAX_FIGHTERS} working territory`}
          </span>
        )}
      </h3>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted border-b">
              <th className="px-4 py-2 text-left font-medium">Fighter</th>
              <th className="px-4 py-2 text-left font-medium w-72 min-w-[18rem]">
                Post-Cycle Action
              </th>
              {/* The icon belongs to the action control, not to a field of its
                  own, so the column carries no visible heading. Its own column
                  is what keeps every dropdown the same width. */}
              <th className="w-12 px-2 py-2">
                <span className="sr-only">Action options</span>
              </th>
              <th className="px-4 py-2 text-right font-medium w-24">Credits</th>
            </tr>
          </thead>
          <tbody>
            {actors.map((fighter) => {
              const row = rows[fighter.id];
              const options = eligiblePostCycleActions(fighter, availability);
              const assignment = row ? toAssignment(fighter.id, row) : null;
              const delta = assignment ? assignmentCreditsDelta(assignment) : 0;

              // The cap is a sequence-wide rule, so it greys out the option on
              // every row that has not already taken one of the five slots.
              const workTerritoryFull =
                workTerritoryCount >= WORK_TERRITORY_MAX_FIGHTERS &&
                row?.action !== 'work_territory';

              /**
               * The one picker this row's action needs, as an icon beside the
               * dropdown. `count` replaces the label the old full-width button
               * carried, which was the only sign a pick had been made.
               */
              const picker = !row
                ? null
                : row.action === 'develop_tactics'
                  ? {
                      Icon: LuWalletCards,
                      title: 'Choose Gang Tactics',
                      count: row.tacticsCardIds.length,
                      disabled: false,
                      open: () => setTacticsPickerFighterId(fighter.id),
                    }
                  : row.action === 'fit_bionics'
                    ? {
                        Icon: FaMedkit,
                        // Rendered even before a target is chosen, so the row does
                        // not reflow the moment one is.
                        title: row.targetFighterId
                          ? 'Choose Lasting Injuries to remove'
                          : 'Pick a target fighter first',
                        count: row.injuryIds.length,
                        disabled: !row.targetFighterId,
                        open: () =>
                          setEffectPicker({ fighterId: fighter.id, kind: 'injuries' }),
                      }
                    : row.action === 'visit_chop_shop'
                      ? {
                          Icon: LuWrench,
                          title: 'Choose Lasting Damage to repair',
                          count: row.damageIds.length,
                          disabled: false,
                          open: () =>
                            setEffectPicker({ fighterId: fighter.id, kind: 'damages' }),
                        }
                      : null;

              return (
                <tr key={fighter.id} className="border-b last:border-0 align-top">
                  <td className="px-4 py-2">
                    <div className="font-medium">{fighter.fighter_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {fighter.fighter_type}
                      {fighter.fighter_subtypes?.length
                        ? ` — ${fighter.fighter_subtypes.join(', ')}`
                        : ''}
                    </div>
                  </td>

                  <td className="px-4 py-2">
                    <Combobox
                        options={options.map((option) => ({
                          value: option.id,
                          // A ReactNode label keeps the rules text on hover the way
                          // the native <option title> did; displayValue drives the
                          // search box and the closed state.
                          label: <span title={option.description}>{option.label}</span>,
                          displayValue: option.label,
                          disabled: option.id === 'work_territory' && workTerritoryFull,
                        }))}
                      value={row?.action ?? ''}
                      onValueChange={(value) => handleActionChange(fighter.id, value)}
                      placeholder="Select Post-Cycle Action"
                      dropdownPlacement="down"
                      clearable
                      disabled={!canEdit}
                    />

                    {/* The two Doc actions still need a target picker of their own;
                        everything else is now the icon above. */}
                    {row?.action === 'medical_escort' && (
                      <div className="space-y-2 mt-2">
                        <Combobox
                          options={criticallyInjured
                            .filter((f) => f.id !== fighter.id)
                            .map((f) => ({ value: f.id, label: f.fighter_name }))}
                          value={row.targetFighterId ?? ''}
                          onValueChange={(value) =>
                            setRow(fighter.id, { targetFighterId: value })
                          }
                          placeholder="Select Critically Injured fighter"
                          noResultsText="No fighter has a Critical Injury"
                          dropdownPlacement="down"
                          clearable
                          disabled={!canEdit}
                        />
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Checkbox
                            checked={row.declineToPay}
                            onCheckedChange={(checked) =>
                              setRow(fighter.id, { declineToPay: checked === true })
                            }
                            disabled={!canEdit}
                          />
                          Decline to pay — the fighter dies, no roll
                        </label>
                        {!row.declineToPay && (
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="whitespace-nowrap">
                              &quot;Good Stuff&quot; (+1 per {MEDICAL_ESCORT_GOOD_STUFF_STEP}cr):
                            </span>
                            <Input
                              type="number"
                              min={0}
                              value={row.goodStuffSteps}
                              onChange={(e) =>
                                setRow(fighter.id, {
                                  goodStuffSteps: Math.max(
                                    0,
                                    parseInt(e.target.value, 10) || 0
                                  ),
                                })
                              }
                              className="h-7 w-16 text-xs"
                              disabled={!canEdit}
                            />
                            <span>= +{row.goodStuffSteps} to the roll</span>
                          </label>
                        )}
                      </div>
                    )}

                    {row?.action === 'fit_bionics' && (
                      <Combobox
                        options={injuredFighters
                          .filter((f) => f.id !== fighter.id)
                          .map((f) => ({ value: f.id, label: f.fighter_name }))}
                        value={row.targetFighterId ?? ''}
                        onValueChange={(value) =>
                          setRow(fighter.id, { targetFighterId: value, injuryIds: [] })
                        }
                        placeholder="Select fighter to fit bionics"
                        noResultsText="No fighter has a removable Lasting Injury"
                        dropdownPlacement="down"
                        clearable
                        disabled={!canEdit}
                        className="mt-2"
                      />
                    )}

                  </td>

                  {/* Always rendered so every row has the same cell count; the
                      column is what keeps the dropdowns a uniform width. */}
                  <td className="px-2 py-2">
                    {picker && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 w-full px-2 gap-1"
                        onClick={picker.open}
                        disabled={!canEdit || picker.disabled}
                        title={picker.title}
                        aria-label={picker.title}
                      >
                        <picker.Icon className="h-4 w-4" />
                        {picker.count > 0 && (
                          <span className="text-xs tabular-nums">{picker.count}</span>
                        )}
                      </Button>
                    )}
                  </td>

                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <span
                      className={
                        delta > 0
                          ? 'text-green-600 font-medium'
                          : delta < 0
                            ? 'text-red-600 font-medium'
                            : 'text-muted-foreground'
                      }
                    >
                      {formatCredits(delta)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {issues.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-red-600">
          {issues.map((issue, index) => (
            <li key={`${issue.fighterId ?? 'gang'}-${index}`}>{issue.message}</li>
          ))}
        </ul>
      )}

      <div className="border-t mt-4 pt-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {totalCost >= 0 ? 'Total cost' : 'Total gained'}
          </span>
          <span className="font-semibold">{Math.abs(totalCost)} credits</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Credits after</span>
          <span className={`font-semibold ${canAfford ? '' : 'text-red-500'}`}>
            {creditsAfter}
          </span>
        </div>
        <Button
          className="w-full"
          onClick={() => setIsConfirming(true)}
          disabled={
            !canEdit ||
            isApplying ||
            assignments.length === 0 ||
            issues.length > 0 ||
            !canAfford
          }
        >
          Resolve {assignments.length} Post-Cycle Action
          {assignments.length === 1 ? '' : 's'}
        </Button>
      </div>

      {/* Injury / damage picker */}
      {effectPicker && pickerFighter && (() => {
        const row = rows[effectPicker.fighterId];
        if (!row) return null;

        const isInjuries = effectPicker.kind === 'injuries';
        const targetFighter = isInjuries
          ? fighters.find((f) => f.id === row.targetFighterId)
          : pickerFighter;
        if (!targetFighter) return null;

        const effects = isInjuries
          ? removableLastingInjuriesOf(targetFighter)
          : lastingDamagesOf(targetFighter);
        const selected = isInjuries ? row.injuryIds : row.damageIds;
        const costEach = isInjuries
          ? FIT_BIONICS_COST_PER_INJURY
          : chopShopCostPerDamage();

        const toggle = (id: string) => {
          const next = selected.includes(id)
            ? selected.filter((existing) => existing !== id)
            : [...selected, id];
          setRow(effectPicker.fighterId, isInjuries
            ? { injuryIds: next }
            : { damageIds: next });
        };

        return (
          <Modal
            title={isInjuries ? 'Remove Lasting Injuries' : 'Repair Lasting Damage'}
            helper={`${targetFighter.fighter_name} — ${costEach} credits each`}
            onClose={() => setEffectPicker(null)}
            onConfirm={() => setEffectPicker(null)}
            confirmText="Done"
            width="md"
          >
            {effects.length === 0 ? (
              <p className="text-muted-foreground italic text-sm">
                {isInjuries
                  ? 'This fighter has no removable Lasting Injuries. A Critical Injury cannot be removed with Fit Bionics.'
                  : 'This vehicle has no Lasting Damage.'}
              </p>
            ) : (
              <div className="space-y-2">
                {effects.map((effect) => (
                  <label
                    key={effect.id}
                    className="flex items-center gap-3 p-2 bg-muted rounded-md cursor-pointer"
                  >
                    <Checkbox
                      checked={selected.includes(effect.id)}
                      onCheckedChange={() => toggle(effect.id)}
                    />
                    <span className="flex-1">{effect.effect_name}</span>
                    <span className="text-muted-foreground text-sm">{costEach}cr</span>
                  </label>
                ))}
                <div className="flex justify-between border-t pt-2 text-sm">
                  <span className="text-muted-foreground">Selected</span>
                  <span className="font-semibold">
                    {selected.length} — {selected.length * costEach} credits
                  </span>
                </div>
              </div>
            )}
          </Modal>
        );
      })()}

      {/* Gang Tactics picker — the same modal the Battles tab uses, but it only
          records the choice here; the cards are added when the sequence resolves. */}
      {tacticsPickerFighterId && (() => {
        const row = rows[tacticsPickerFighterId];
        if (!row) return null;

        // Cards another row has already claimed. Without this two fighters could
        // pick the same card and the insert would silently drop the second.
        const reservedCardIds = new Set(
          Object.entries(rows)
            .filter(([fighterId]) => fighterId !== tacticsPickerFighterId)
            .flatMap(([, other]) => other.tacticsCardIds)
        );

        return (
          <TacticsCardPickerModal
            gangId={gangId}
            editionSlug={editionSlug}
            ownedCardIds={ownedTacticsCardIds}
            reservedCardIds={reservedCardIds}
            initialSelectedIds={row.tacticsCardIds}
            title="Develop Tactics"
            helper={`${
              fighters.find((f) => f.id === tacticsPickerFighterId)?.fighter_name ?? ''
            } — added to the roster when the sequence resolves.`}
            confirmText="Done"
            onConfirm={(cardIds) => {
              setRow(tacticsPickerFighterId, { tacticsCardIds: cardIds });
              setTacticsPickerFighterId(null);
              return true;
            }}
            onClose={() => setTacticsPickerFighterId(null)}
          />
        );
      })()}

      {/* Confirm */}
      {isConfirming && (
        <Modal
          title="Resolve Post-Cycle Sequence"
          helper={`${assignments.length} action${
            assignments.length === 1 ? '' : 's'
          } — ${Math.abs(totalCost)} credits ${totalCost >= 0 ? 'spent' : 'gained'}`}
          onClose={() => setIsConfirming(false)}
          onConfirm={handleApply}
          confirmText={isApplying ? 'Resolving…' : 'Resolve'}
          confirmDisabled={isApplying}
          width="lg"
        >
          <div className="space-y-2">
            {assignments.map((assignment) => {
              const performer = fighters.find((f) => f.id === assignment.fighterId);
              const target =
                assignment.action === 'medical_escort' ||
                assignment.action === 'fit_bionics'
                  ? fighters.find((f) => f.id === assignment.targetFighterId)
                  : undefined;
              const delta = assignmentCreditsDelta(assignment);

              return (
                <div
                  key={assignment.fighterId}
                  className="flex items-start justify-between gap-3 p-2 bg-muted rounded-md"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{performer?.fighter_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {POST_CYCLE_ACTIONS[assignment.action].label}
                      {target && ` → ${target.fighter_name}`}
                      {assignment.action === 'medical_escort' &&
                        (assignment.declineToPay
                          ? ' — declining to pay, the fighter dies'
                          : ` — ${
                              MEDICAL_ESCORT_COST +
                              assignment.goodStuffSteps * MEDICAL_ESCORT_GOOD_STUFF_STEP
                            }cr, +${assignment.goodStuffSteps} to the roll`)}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm">{formatCredits(delta)}</span>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground pt-2">
              Medical Escort is rolled on the server, so its result is shown after
              resolving.
            </p>
          </div>
        </Modal>
      )}

      {/* Only shown when part of the sequence failed — a clean run reports
          through the toast instead. */}
      {outcomes && (
        <Modal
          title="Some Post-Cycle Actions Could Not Be Applied"
          helper="The rest were applied and have been logged."
          onClose={() => setOutcomes(null)}
          hideCancel
          width="lg"
        >
          <div className="space-y-2">
            {outcomes.map((outcome) => (
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
