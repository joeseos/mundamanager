/**
 * The N26 Post-cycle Sequence.
 *
 * Between battles each model in the gang may perform one Post-cycle Action.
 * This module owns the catalog, the eligibility rules and the costs, so neither
 * the UI (components/gang/post-cycle-actions.tsx) nor the server action
 * (app/actions/post-cycle-actions.ts) restates them — the client uses them to
 * build and pre-validate the form, and the server re-runs the same checks
 * against freshly read rows before applying anything.
 *
 * Gated by `hasPostCycleActions` in types/edition.ts, not by comparing slugs.
 */

import type { FighterEffect } from '@/types/fighter-effect';
import { vehicleRepairModelFor } from '@/utils/dice';
import { EDITION_N26 } from '@/types/edition';

// =============================================================================
// Catalog
// =============================================================================

export type PostCycleActionId =
  | 'medical_escort'
  | 'fit_bionics'
  | 'develop_tactics'
  | 'visit_chop_shop'
  | 'work_territory'
  | 'visit_trading_post'
  | 'train';

/**
 * Who may perform an action. Matched against `fighters.fighter_subtypes`, which
 * on N26 carries 'Leader' / 'Champion' / 'Ganger' / 'Prospect' (see
 * utils/fighterSubtypeRankN26.ts) — except `vehicle`, which is the
 * `fighters.is_vehicle` flag, since N26 vehicles are fighters in their own right.
 */
type Performer =
  | { kind: 'subtypes'; subtypes: readonly string[] }
  | { kind: 'vehicle' }
  | { kind: 'any' };

/** What the player must pick before the action can be applied. */
export type PostCycleActionTarget =
  /** Another fighter in the gang, plus which of their effect rows to act on. */
  | 'critically_injured_fighter'
  | 'injured_fighter'
  /** Rows on the performing fighter itself. */
  | 'own_lasting_damage'
  | 'none';

export interface PostCycleActionDefinition {
  id: PostCycleActionId;
  label: string;
  /** Rules text, shown in the row's Details cell and the confirm summary. */
  description: string;
  performer: Performer;
  target: PostCycleActionTarget;
  /** Cap per Post-cycle Sequence, or null for unlimited. */
  maxPerSequence: number | null;
}

export const MEDICAL_ESCORT_COST = 30;
/** "I'll Use the Good Stuff": every extra 50 credits adds +1 to the D6. */
export const MEDICAL_ESCORT_GOOD_STUFF_STEP = 50;
export const FIT_BIONICS_COST_PER_INJURY = 50;
export const WORK_TERRITORY_INCOME = 15;
export const WORK_TERRITORY_MAX_FIGHTERS = 5;
export const TRAIN_XP = 2;

/**
 * A Critical Injury kills the fighter if untreated, so it is the only thing
 * Medical Escort can target — and the one thing Fit Bionics cannot remove.
 * Must match the seeded effect_name exactly (see
 * supabase/migrations/20260806160000_seed_n26_lasting_injuries.sql).
 */
export const CRITICAL_INJURY_EFFECT_NAME = 'Critical Injury';

/**
 * Chop Shop charges the same per-damage rate as the N26 repair rules, so it
 * reads the figure from the edition's repair model rather than restating 50.
 */
export function chopShopCostPerDamage(): number {
  const model = vehicleRepairModelFor(EDITION_N26);
  return model?.kind === 'per-damage' ? model.costPerDamage : 0;
}

const LEADER_CHAMPION = ['leader', 'champion'] as const;
const LEADER_CHAMPION_GANGER_PROSPECT = ['leader', 'champion', 'ganger', 'prospect'] as const;

export const POST_CYCLE_ACTIONS: Record<PostCycleActionId, PostCycleActionDefinition> = {
  medical_escort: {
    id: 'medical_escort',
    label: 'Medical Escort',
    description:
      `Escort a Critically Injured gang member to the Doc for ${MEDICAL_ESCORT_COST} credits. ` +
      `Roll a D6: 1 the fighter dies, 2-3 stabilised with a Lasting Injury, 4+ full recovery. ` +
      `Every extra ${MEDICAL_ESCORT_GOOD_STUFF_STEP} credits adds +1 to the roll. ` +
      `Decline to pay and the fighter dies with no roll.`,
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION },
    target: 'critically_injured_fighter',
    maxPerSequence: null,
  },
  fit_bionics: {
    id: 'fit_bionics',
    label: 'Fit Bionics',
    description:
      `Take another fighter to the Doc for bionics. ${FIT_BIONICS_COST_PER_INJURY} credits ` +
      `removes one Lasting Injury; multiple instances of the same injury must each be ` +
      `removed separately. A Critical Injury cannot be removed this way.`,
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION },
    target: 'injured_fighter',
    maxPerSequence: null,
  },
  develop_tactics: {
    id: 'develop_tactics',
    label: 'Develop Tactics',
    description: 'Generate a new Gang Tactic and add it to the Gang Roster.',
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION },
    target: 'none',
    maxPerSequence: null,
  },
  visit_chop_shop: {
    id: 'visit_chop_shop',
    label: 'Visit Chop Shop',
    description:
      `Repair the vehicle's Lasting Damage at ${chopShopCostPerDamage()} credits each ` +
      `(Critical Damage included). Multiple instances of the same damage must each be ` +
      `removed separately.`,
    performer: { kind: 'vehicle' },
    target: 'own_lasting_damage',
    maxPerSequence: null,
  },
  work_territory: {
    id: 'work_territory',
    label: 'Work Territory',
    description:
      `Work a Territory for ${WORK_TERRITORY_INCOME} credits added to the gang's Stash. ` +
      `At most ${WORK_TERRITORY_MAX_FIGHTERS} fighters may do this per Post-cycle Sequence.`,
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION_GANGER_PROSPECT },
    target: 'none',
    maxPerSequence: WORK_TERRITORY_MAX_FIGHTERS,
  },
  visit_trading_post: {
    id: 'visit_trading_post',
    label: 'Visit Trading Post',
    description:
      'Visit the Trading Post to see what the gang can find. Buy the equipment itself from ' +
      'the Stash tab.',
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION },
    target: 'none',
    maxPerSequence: null,
  },
  train: {
    id: 'train',
    label: 'Train',
    description: `Practise for the battles ahead. The model earns ${TRAIN_XP} XP.`,
    performer: { kind: 'any' },
    target: 'none',
    maxPerSequence: null,
  },
};

/** Display order: the actions with real consequences first, Train last. */
export const POST_CYCLE_ACTION_ORDER: PostCycleActionId[] = [
  'medical_escort',
  'fit_bionics',
  'visit_chop_shop',
  'work_territory',
  'develop_tactics',
  'visit_trading_post',
  'train',
];

// =============================================================================
// Fighter shape
// =============================================================================

/**
 * The slice of a fighter this module reads. Structural rather than importing
 * FighterProps, so the server action can pass rows built straight from the
 * database without assembling a full fighter.
 */
export interface PostCycleFighter {
  id: string;
  fighter_name: string;
  fighter_type?: string;
  fighter_subtypes?: string[] | null;
  is_vehicle?: boolean;
  killed?: boolean;
  retired?: boolean;
  enslaved?: boolean;
  captured?: boolean;
  recovery?: boolean;
  effects?: {
    injuries?: FighterEffect[];
    'lasting damages'?: FighterEffect[];
    [key: string]: FighterEffect[] | undefined;
  };
}

// =============================================================================
// Eligibility
// =============================================================================

/**
 * A fighter must be on their feet to spend a Post-cycle Action. Recovery counts
 * as unavailable: the fighter is out of play for the cycle. Being *targeted* by
 * Medical Escort or Fit Bionics is not performing, so targets are not filtered
 * by this — a Critically Injured fighter is always in Recovery.
 */
export function canActInPostCycle(fighter: PostCycleFighter): boolean {
  return (
    !fighter.killed &&
    !fighter.retired &&
    !fighter.enslaved &&
    !fighter.captured &&
    !fighter.recovery
  );
}

function hasSubtype(fighter: PostCycleFighter, subtypes: readonly string[]): boolean {
  const owned = (fighter.fighter_subtypes ?? []).map((s) => s.toLowerCase());
  return subtypes.some((wanted) => owned.includes(wanted));
}

/** Whether this fighter's role and status allow this action at all. */
export function canPerformPostCycleAction(
  fighter: PostCycleFighter,
  actionId: PostCycleActionId
): boolean {
  if (!canActInPostCycle(fighter)) return false;

  const { performer } = POST_CYCLE_ACTIONS[actionId];
  switch (performer.kind) {
    case 'any':
      return true;
    case 'vehicle':
      return fighter.is_vehicle === true;
    case 'subtypes':
      // A vehicle is a model, not a ganger — it never fills a crew role.
      return !fighter.is_vehicle && hasSubtype(fighter, performer.subtypes);
  }
}

/** Every action this fighter could take, in display order. */
export function eligiblePostCycleActions(
  fighter: PostCycleFighter
): PostCycleActionDefinition[] {
  return POST_CYCLE_ACTION_ORDER.filter((id) =>
    canPerformPostCycleAction(fighter, id)
  ).map((id) => POST_CYCLE_ACTIONS[id]);
}

// =============================================================================
// Effect row selectors
// =============================================================================

const injuriesOf = (fighter: PostCycleFighter): FighterEffect[] =>
  fighter.effects?.injuries ?? [];

/** The rows Medical Escort can treat. */
export const criticalInjuriesOf = (fighter: PostCycleFighter): FighterEffect[] =>
  injuriesOf(fighter).filter((e) => e.effect_name === CRITICAL_INJURY_EFFECT_NAME);

/** The rows Fit Bionics can remove — every Lasting Injury except a Critical one. */
export const removableLastingInjuriesOf = (fighter: PostCycleFighter): FighterEffect[] =>
  injuriesOf(fighter).filter((e) => e.effect_name !== CRITICAL_INJURY_EFFECT_NAME);

/**
 * The rows the Chop Shop can repair. On N26 the vehicle IS the fighter, so its
 * Lasting Damage sits in the fighter's own effects rather than on a `vehicles` row.
 */
export const lastingDamagesOf = (fighter: PostCycleFighter): FighterEffect[] =>
  fighter.effects?.['lasting damages'] ?? [];

export const hasCriticalInjury = (fighter: PostCycleFighter): boolean =>
  criticalInjuriesOf(fighter).length > 0;

// =============================================================================
// Assignments
// =============================================================================

/**
 * One fighter's chosen action. A discriminated union so an assignment cannot
 * carry the wrong extras — a Train row has no target, a Fit Bionics row cannot
 * omit its injury ids.
 */
export type PostCycleAssignment =
  | {
      fighterId: string;
      action: 'medical_escort';
      targetFighterId: string;
      /** Extra 50-credit steps bought for the Doc; each adds +1 to the D6. */
      goodStuffSteps: number;
      /** Refuse to pay: no roll is made and the fighter dies. */
      declineToPay?: boolean;
    }
  | {
      fighterId: string;
      action: 'fit_bionics';
      targetFighterId: string;
      /** fighter_effects ids to remove; one charge each. */
      injuryIds: string[];
    }
  | {
      fighterId: string;
      action: 'visit_chop_shop';
      /** fighter_effects ids on the performing vehicle. */
      damageIds: string[];
    }
  | {
      fighterId: string;
      action: 'develop_tactics' | 'visit_trading_post' | 'work_territory' | 'train';
    };

/** The fighter an assignment acts upon, where it has one. */
export function assignmentTargetId(assignment: PostCycleAssignment): string | null {
  return assignment.action === 'medical_escort' || assignment.action === 'fit_bionics'
    ? assignment.targetFighterId
    : null;
}

/**
 * Net credits for one assignment: negative spends, positive earns. Chop Shop is
 * included, so a caller that delegates the repair to `repairVehicleDamage` must
 * exclude it from the aggregate rather than paying twice — see
 * `postCycleCreditsBreakdown`.
 */
export function assignmentCreditsDelta(assignment: PostCycleAssignment): number {
  switch (assignment.action) {
    case 'medical_escort':
      return assignment.declineToPay
        ? 0
        : -(MEDICAL_ESCORT_COST +
            assignment.goodStuffSteps * MEDICAL_ESCORT_GOOD_STUFF_STEP);
    case 'fit_bionics':
      return -(assignment.injuryIds.length * FIT_BIONICS_COST_PER_INJURY);
    case 'visit_chop_shop':
      return -(assignment.damageIds.length * chopShopCostPerDamage());
    case 'work_territory':
      return WORK_TERRITORY_INCOME;
    default:
      return 0;
  }
}

export interface PostCycleCreditsBreakdown {
  /** Everything the caller settles itself in one gang financial update. */
  aggregate: number;
  /** Chop Shop repairs, which `repairVehicleDamage` charges on its own. */
  delegated: number;
  /** Sum of both — what the player sees as the cost of the whole sequence. */
  total: number;
}

/**
 * Splits the credit movement by who actually writes it. Chop Shop is delegated
 * to `repairVehicleDamage`, which deducts its own cost; everything else is
 * settled in a single compare-and-swap so the balance can never be half-applied
 * across a dozen separate updates.
 */
export function postCycleCreditsBreakdown(
  assignments: PostCycleAssignment[]
): PostCycleCreditsBreakdown {
  let aggregate = 0;
  let delegated = 0;

  for (const assignment of assignments) {
    const delta = assignmentCreditsDelta(assignment);
    if (assignment.action === 'visit_chop_shop') {
      delegated += delta;
    } else {
      aggregate += delta;
    }
  }

  return { aggregate, delegated, total: aggregate + delegated };
}

// =============================================================================
// Validation
// =============================================================================

export interface PostCycleValidationIssue {
  /** The fighter the message is about, where it is about one. */
  fighterId?: string;
  message: string;
}

/**
 * Every cross-fighter rule, in one place so the form and the server agree.
 *
 * The client calls this to disable Confirm and grey out options; the server
 * calls it again on freshly read rows, because the assignment list arrives from
 * the browser and is not trusted.
 */
export function validatePostCycleAssignments(
  fighters: PostCycleFighter[],
  assignments: PostCycleAssignment[]
): PostCycleValidationIssue[] {
  const issues: PostCycleValidationIssue[] = [];
  const byId = new Map(fighters.map((f) => [f.id, f]));

  const seenPerformers = new Set<string>();
  const medicalEscortTargets = new Set<string>();
  const fitBionicsTargets = new Set<string>();
  let workTerritoryCount = 0;

  for (const assignment of assignments) {
    const performer = byId.get(assignment.fighterId);

    if (!performer) {
      issues.push({
        fighterId: assignment.fighterId,
        message: 'Fighter is not part of this gang.',
      });
      continue;
    }

    const label = performer.fighter_name;

    if (seenPerformers.has(assignment.fighterId)) {
      issues.push({
        fighterId: assignment.fighterId,
        message: `${label} is assigned more than one Post-cycle Action.`,
      });
    }
    seenPerformers.add(assignment.fighterId);

    if (!canPerformPostCycleAction(performer, assignment.action)) {
      issues.push({
        fighterId: assignment.fighterId,
        message: `${label} cannot perform ${POST_CYCLE_ACTIONS[assignment.action].label}.`,
      });
    }

    switch (assignment.action) {
      case 'work_territory':
        workTerritoryCount += 1;
        break;

      case 'medical_escort': {
        const target = byId.get(assignment.targetFighterId);
        if (!target) {
          issues.push({
            fighterId: assignment.fighterId,
            message: `${label}'s Medical Escort target is not part of this gang.`,
          });
          break;
        }
        if (target.id === performer.id) {
          issues.push({
            fighterId: assignment.fighterId,
            message: `${label} cannot escort themselves.`,
          });
        }
        if (!hasCriticalInjury(target)) {
          issues.push({
            fighterId: assignment.fighterId,
            message: `${target.fighter_name} has no Critical Injury to treat.`,
          });
        }
        if (assignment.goodStuffSteps < 0 || !Number.isInteger(assignment.goodStuffSteps)) {
          issues.push({
            fighterId: assignment.fighterId,
            message: `${label}'s extra supplies must be a whole number of steps.`,
          });
        }
        medicalEscortTargets.add(target.id);
        break;
      }

      case 'fit_bionics': {
        const target = byId.get(assignment.targetFighterId);
        if (!target) {
          issues.push({
            fighterId: assignment.fighterId,
            message: `${label}'s Fit Bionics target is not part of this gang.`,
          });
          break;
        }
        if (target.id === performer.id) {
          issues.push({
            fighterId: assignment.fighterId,
            message: `${label} cannot fit their own bionics.`,
          });
        }
        if (assignment.injuryIds.length === 0) {
          issues.push({
            fighterId: assignment.fighterId,
            message: `Choose at least one Lasting Injury to remove from ${target.fighter_name}.`,
          });
        }
        const removable = new Set(removableLastingInjuriesOf(target).map((e) => e.id));
        if (assignment.injuryIds.some((id) => !removable.has(id))) {
          issues.push({
            fighterId: assignment.fighterId,
            message: `${target.fighter_name} does not have every selected Lasting Injury, or one of them is a Critical Injury.`,
          });
        }
        if (new Set(assignment.injuryIds).size !== assignment.injuryIds.length) {
          issues.push({
            fighterId: assignment.fighterId,
            message: `${target.fighter_name} has the same Lasting Injury selected twice.`,
          });
        }
        fitBionicsTargets.add(target.id);
        break;
      }

      case 'visit_chop_shop': {
        if (assignment.damageIds.length === 0) {
          issues.push({
            fighterId: assignment.fighterId,
            message: `Choose at least one Lasting Damage to repair on ${label}.`,
          });
        }
        const repairable = new Set(lastingDamagesOf(performer).map((e) => e.id));
        if (assignment.damageIds.some((id) => !repairable.has(id))) {
          issues.push({
            fighterId: assignment.fighterId,
            message: `${label} does not have every selected Lasting Damage.`,
          });
        }
        if (new Set(assignment.damageIds).size !== assignment.damageIds.length) {
          issues.push({
            fighterId: assignment.fighterId,
            message: `${label} has the same Lasting Damage selected twice.`,
          });
        }
        break;
      }
    }
  }

  if (workTerritoryCount > WORK_TERRITORY_MAX_FIGHTERS) {
    issues.push({
      message:
        `At most ${WORK_TERRITORY_MAX_FIGHTERS} fighters may Work Territory per ` +
        `Post-cycle Sequence (${workTerritoryCount} assigned).`,
    });
  }

  // "The targeted Fighter cannot perform any Post-cycle Actions themselves and a
  // Fighter cannot be targeted by both the Medical Escort and Fit Bionics
  // Post-cycle Actions in the same Post-cycle Sequence."
  for (const targetId of [...medicalEscortTargets, ...fitBionicsTargets]) {
    if (seenPerformers.has(targetId)) {
      issues.push({
        fighterId: targetId,
        message:
          `${byId.get(targetId)?.fighter_name ?? 'A fighter'} is being taken to the Doc ` +
          `and cannot perform a Post-cycle Action.`,
      });
    }
  }

  for (const targetId of medicalEscortTargets) {
    if (fitBionicsTargets.has(targetId)) {
      issues.push({
        fighterId: targetId,
        message:
          `${byId.get(targetId)?.fighter_name ?? 'A fighter'} cannot be targeted by both ` +
          `Medical Escort and Fit Bionics in the same Post-cycle Sequence.`,
      });
    }
  }

  return issues;
}
