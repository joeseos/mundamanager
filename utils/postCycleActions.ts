/**
 * N26 Post-cycle Sequence rules, shared by the form and the server action. The
 * server re-runs validatePostCycleAssignment on its own reads before applying.
 */

import type { FighterEffect } from '@/types/fighter-effect';
import { resolveMedicalEscort, type MedicalEscortOutcome } from '@/utils/dice';
import { countsTowardRating } from '@/utils/fighter-status';

export type PostCycleActionId =
  | 'medical_escort'
  | 'fit_bionics'
  | 'develop_tactics'
  | 'visit_chop_shop'
  | 'work_territory'
  | 'visit_trading_post'
  | 'train';

/** Subtypes match fighters.fighter_subtypes; `vehicle` means fighters.is_vehicle. */
type Performer =
  | { kind: 'subtypes'; subtypes: readonly string[] }
  | { kind: 'vehicle' }
  | { kind: 'any' };

export interface PostCycleActionDefinition {
  id: PostCycleActionId;
  label: string;
  summary: string;
  performer: Performer;
}

export const MEDICAL_ESCORT_COST = 30;
export const FIT_BIONICS_COST_PER_INJURY = 50;
export const WORK_TERRITORY_INCOME = 15;
export const WORK_TERRITORY_MAX_FIGHTERS = 5;
export const TRAIN_XP = 2;

/** Must match the seeded N26 effect_name exactly. */
export const CRITICAL_INJURY_EFFECT_NAME = 'Critical Injury';

const LEADER_CHAMPION = ['leader', 'champion'] as const;
const LEADER_CHAMPION_GANGER_PROSPECT = ['leader', 'champion', 'ganger', 'prospect'] as const;

export const POST_CYCLE_ACTIONS: Record<PostCycleActionId, PostCycleActionDefinition> = {
  medical_escort: {
    id: 'medical_escort',
    label: 'Medical Escort',
    summary: `${MEDICAL_ESCORT_COST} credits + D6`,
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION },
  },
  fit_bionics: {
    id: 'fit_bionics',
    label: 'Fit Bionics',
    summary: `${FIT_BIONICS_COST_PER_INJURY} credits per injury`,
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION },
  },
  visit_chop_shop: {
    id: 'visit_chop_shop',
    label: 'Visit Chop Shop',
    summary: 'Logged only',
    performer: { kind: 'vehicle' },
  },
  work_territory: {
    id: 'work_territory',
    label: 'Work Territory',
    summary: `+${WORK_TERRITORY_INCOME} credits`,
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION_GANGER_PROSPECT },
  },
  develop_tactics: {
    id: 'develop_tactics',
    label: 'Develop Tactics',
    summary: 'Logged only',
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION },
  },
  visit_trading_post: {
    id: 'visit_trading_post',
    label: 'Visit Trading Post',
    summary: 'Logged only',
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION },
  },
  train: {
    id: 'train',
    label: 'Train',
    summary: `+${TRAIN_XP} XP`,
    performer: { kind: 'any' },
  },
};

/**
 * Display order, derived from the catalog so a new action cannot be added to
 * one and forgotten in the other. Key order above is the display order.
 */
export const POST_CYCLE_ACTION_ORDER = Object.keys(
  POST_CYCLE_ACTIONS
) as PostCycleActionId[];

/** The fighter fields these rules read, shared by FighterProps and GangFighter. */
export interface PostCycleFighter {
  id: string;
  fighter_name: string;
  fighter_subtypes?: string[] | null;
  is_vehicle?: boolean;
  killed?: boolean;
  retired?: boolean;
  enslaved?: boolean;
  captured?: boolean;
  recovery?: boolean;
  effects?: {
    injuries?: FighterEffect[];
    [key: string]: FighterEffect[] | undefined;
  };
}

/** Performers only: a Doc patient is always in Recovery, so targets skip this. */
export function canActInPostCycle(fighter: PostCycleFighter): boolean {
  return countsTowardRating(fighter) && !fighter.recovery;
}

function hasSubtype(fighter: PostCycleFighter, subtypes: readonly string[]): boolean {
  const owned = (fighter.fighter_subtypes ?? []).map((s) => s.toLowerCase());
  return subtypes.some((wanted) => owned.includes(wanted));
}

export interface PostCycleAvailability {
  tacticsCardsAvailable: boolean;
}

export function canPerformPostCycleAction(
  fighter: PostCycleFighter,
  actionId: PostCycleActionId,
  availability: PostCycleAvailability
): boolean {
  if (!canActInPostCycle(fighter)) return false;
  if (actionId === 'develop_tactics' && !availability.tacticsCardsAvailable) return false;

  const { performer } = POST_CYCLE_ACTIONS[actionId];
  switch (performer.kind) {
    case 'any':
      return true;
    case 'vehicle':
      return fighter.is_vehicle === true;
    case 'subtypes':
      return !fighter.is_vehicle && hasSubtype(fighter, performer.subtypes);
  }
}

export function eligiblePostCycleActions(
  fighter: PostCycleFighter,
  availability: PostCycleAvailability
): PostCycleActionDefinition[] {
  return POST_CYCLE_ACTION_ORDER.filter((id) =>
    canPerformPostCycleAction(fighter, id, availability)
  ).map((id) => POST_CYCLE_ACTIONS[id]);
}

const injuriesOf = (fighter: PostCycleFighter): FighterEffect[] =>
  fighter.effects?.injuries ?? [];

export const criticalInjuriesOf = (fighter: PostCycleFighter): FighterEffect[] =>
  injuriesOf(fighter).filter((e) => e.effect_name === CRITICAL_INJURY_EFFECT_NAME);

export const removableLastingInjuriesOf = (fighter: PostCycleFighter): FighterEffect[] =>
  injuriesOf(fighter).filter((e) => e.effect_name !== CRITICAL_INJURY_EFFECT_NAME);

export const hasCriticalInjury = (fighter: PostCycleFighter): boolean =>
  criticalInjuriesOf(fighter).length > 0;

export type PostCycleAssignment =
  | {
      fighterId: string;
      action: 'medical_escort';
      targetFighterId: string;
    }
  | {
      fighterId: string;
      action: 'fit_bionics';
      targetFighterId: string;
      injuryIds: string[];
    }
  | {
      fighterId: string;
      action:
        | 'develop_tactics'
        | 'visit_chop_shop'
        | 'visit_trading_post'
        | 'work_territory'
        | 'train';
    };

/** Negative spends. */
export function assignmentCreditsDelta(assignment: PostCycleAssignment): number {
  switch (assignment.action) {
    case 'medical_escort':
      return -MEDICAL_ESCORT_COST;
    case 'fit_bionics':
      return -(assignment.injuryIds.length * FIT_BIONICS_COST_PER_INJURY);
    case 'work_territory':
      return WORK_TERRITORY_INCOME;
    // Named rather than defaulted, so a new action has to state its price.
    case 'develop_tactics':
    case 'visit_chop_shop':
    case 'visit_trading_post':
    case 'train':
      return 0;
    default: {
      const unpriced: never = assignment;
      throw new Error(
        `No credits rule for ${(unpriced as PostCycleAssignment).action}`
      );
    }
  }
}

function selectedEffectIssues(
  selectedIds: string[],
  available: FighterEffect[],
  subject: string,
  noun: string
): string[] {
  const messages: string[] = [];

  if (selectedIds.length === 0) {
    messages.push(`Choose at least one ${noun} on ${subject}.`);
  }

  const availableIds = new Set(available.map((effect) => effect.id));
  if (selectedIds.some((id) => !availableIds.has(id))) {
    messages.push(`${subject} does not have every selected ${noun}.`);
  }

  if (new Set(selectedIds).size !== selectedIds.length) {
    messages.push(`${subject} has the same ${noun} selected twice.`);
  }

  return messages;
}

export interface PostCycleValidationIssue {
  fighterId?: string;
  message: string;
}

export type PostCycleValidationContext = PostCycleAvailability;

/**
 * Everything one action must satisfy on its own.
 *
 * Cross-fighter bookkeeping used to live here, because a whole sequence arrived
 * at once and the rows had to be checked against each other. Actions now
 * resolve one at a time, so the previous one's consequences are already saved
 * by the time the next is validated, and the only rules left are about this
 * assignment: can the performer take it, and is the target still a legal one.
 */
export function validatePostCycleAssignment(
  fighters: PostCycleFighter[],
  assignment: PostCycleAssignment,
  context: PostCycleValidationContext
): PostCycleValidationIssue[] {
  const issues: PostCycleValidationIssue[] = [];
  const byId = new Map(fighters.map((f) => [f.id, f]));
  const performer = byId.get(assignment.fighterId);

  if (!performer) {
    return [{ fighterId: assignment.fighterId, message: 'Fighter is not part of this gang.' }];
  }

  const label = performer.fighter_name;

  if (!canPerformPostCycleAction(performer, assignment.action, context)) {
    issues.push({
      fighterId: assignment.fighterId,
      message: `${label} cannot perform ${POST_CYCLE_ACTIONS[assignment.action].label}.`,
    });
  }

  switch (assignment.action) {
    case 'medical_escort':
    case 'fit_bionics': {
      const target = byId.get(assignment.targetFighterId);
      if (!target || target.id === performer.id || !countsTowardRating(target)) {
        issues.push({
          fighterId: assignment.fighterId,
          message: `${label} cannot take that fighter to the Doc.`,
        });
        break;
      }

      if (assignment.action === 'fit_bionics') {
        for (const message of selectedEffectIssues(
          assignment.injuryIds,
          removableLastingInjuriesOf(target),
          target.fighter_name,
          'removable Lasting Injury'
        )) {
          issues.push({ fighterId: assignment.fighterId, message });
        }
        break;
      }

      if (!hasCriticalInjury(target)) {
        issues.push({
          fighterId: assignment.fighterId,
          message: `${target.fighter_name} has no Critical Injury to treat.`,
        });
      }
      break;
    }

  }

  return issues;
}
