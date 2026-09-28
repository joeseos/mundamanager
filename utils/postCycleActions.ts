/**
 * N26 Post-cycle Sequence rules, shared by the form and the server action. The
 * server re-runs validatePostCycleAssignments on its own reads before applying.
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
  description: string;
  performer: Performer;
}

export const MEDICAL_ESCORT_COST = 30;
export const MEDICAL_ESCORT_GOOD_STUFF_STEP = 50;
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
    summary: `${MEDICAL_ESCORT_COST}cr + D6`,
    description:
      `Escort a Critically Injured gang member to the Doc for ${MEDICAL_ESCORT_COST} credits. ` +
      `Roll a D6: 1 the fighter dies, 2-3 stabilised with a Lasting Injury, 4+ full recovery. ` +
      `Every extra ${MEDICAL_ESCORT_GOOD_STUFF_STEP} credits adds +1 to the roll. ` +
      `Decline to pay and the fighter dies with no roll.`,
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION },
  },
  fit_bionics: {
    id: 'fit_bionics',
    label: 'Fit Bionics',
    summary: `${FIT_BIONICS_COST_PER_INJURY}cr per injury`,
    description:
      `Take another fighter to the Doc for bionics. ${FIT_BIONICS_COST_PER_INJURY} credits ` +
      `removes one Lasting Injury; multiple instances of the same injury must each be ` +
      `removed separately. A Critical Injury cannot be removed this way.`,
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION },
  },
  develop_tactics: {
    id: 'develop_tactics',
    label: 'Develop Tactics',
    summary: 'New Gang Tactics',
    description:
      'Generate new Gang Tactics and add them to the Gang Roster. Roll a D66 or ' +
      'pick from the edition\'s catalogue; the cards are added when the sequence resolves.',
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION },
  },
  visit_chop_shop: {
    id: 'visit_chop_shop',
    label: 'Visit Chop Shop',
    summary: 'Logged only',
    description:
      'Take the vehicle to the Chop Shop. Repairs are made, and paid for, from its ' +
      'Lasting Damage list.',
    performer: { kind: 'vehicle' },
  },
  work_territory: {
    id: 'work_territory',
    label: 'Work Territory',
    summary: `+${WORK_TERRITORY_INCOME}cr`,
    description:
      `Work a Territory for ${WORK_TERRITORY_INCOME} credits added to the gang's Stash. ` +
      `At most ${WORK_TERRITORY_MAX_FIGHTERS} fighters may do this per Post-cycle Sequence.`,
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION_GANGER_PROSPECT },
  },
  visit_trading_post: {
    id: 'visit_trading_post',
    label: 'Visit Trading Post',
    summary: 'Logged only',
    description:
      'Visit the Trading Post to see what the gang can find. Buy the equipment itself from ' +
      'the Stash tab.',
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION },
  },
  train: {
    id: 'train',
    label: 'Train',
    summary: `+${TRAIN_XP} XP`,
    description: `Practise for the battles ahead. The model earns ${TRAIN_XP} XP.`,
    performer: { kind: 'any' },
  },
};

export const POST_CYCLE_ACTION_ORDER: PostCycleActionId[] = [
  'medical_escort',
  'fit_bionics',
  'visit_chop_shop',
  'work_territory',
  'develop_tactics',
  'visit_trading_post',
  'train',
];

/** How many of the six D6 faces land on each outcome after the Good Stuff bonus. */
export function medicalEscortOdds(
  goodStuffSteps: number
): Record<MedicalEscortOutcome, number> {
  const odds: Record<MedicalEscortOutcome, number> = {
    Complications: 0,
    Stabilised: 0,
    'Full Recovery': 0,
  };
  for (let face = 1; face <= 6; face++) {
    const outcome = resolveMedicalEscort(face + goodStuffSteps);
    if (outcome) odds[outcome] += 1;
  }
  return odds;
}

/** Past this many steps Full Recovery is already certain, so more buys nothing. */
export const MEDICAL_ESCORT_MAX_USEFUL_STEPS = (() => {
  let steps = 0;
  while (steps < 6 && medicalEscortOdds(steps)['Full Recovery'] < 6) steps += 1;
  return steps;
})();

/** The fighter fields these rules read, so the server can pass plain rows. */
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
      goodStuffSteps: number;
      declineToPay?: boolean;
    }
  | {
      fighterId: string;
      action: 'fit_bionics';
      targetFighterId: string;
      injuryIds: string[];
    }
  | {
      fighterId: string;
      action: 'develop_tactics';
      tacticsCardIds: string[];
    }
  | {
      fighterId: string;
      action: 'visit_chop_shop' | 'visit_trading_post' | 'work_territory' | 'train';
    };

/** Negative spends. */
export function assignmentCreditsDelta(assignment: PostCycleAssignment): number {
  switch (assignment.action) {
    case 'medical_escort':
      return assignment.declineToPay
        ? 0
        : -(MEDICAL_ESCORT_COST +
            assignment.goodStuffSteps * MEDICAL_ESCORT_GOOD_STUFF_STEP);
    case 'fit_bionics':
      return -(assignment.injuryIds.length * FIT_BIONICS_COST_PER_INJURY);
    case 'work_territory':
      return WORK_TERRITORY_INCOME;
    default:
      return 0;
  }
}

/** The planned total. The server bills from what each action actually did. */
export function postCycleTotalCredits(assignments: PostCycleAssignment[]): number {
  return assignments.reduce(
    (sum, assignment) => sum + assignmentCreditsDelta(assignment),
    0
  );
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

export interface PostCycleValidationContext extends PostCycleAvailability {
  ownedTacticsCardIds: Set<string>;
}

export function validatePostCycleAssignments(
  fighters: PostCycleFighter[],
  assignments: PostCycleAssignment[],
  context: PostCycleValidationContext
): PostCycleValidationIssue[] {
  const issues: PostCycleValidationIssue[] = [];
  const byId = new Map(fighters.map((f) => [f.id, f]));
  const ownedTacticsCardIds = context.ownedTacticsCardIds;
  const claimedTacticsCards = new Map<string, string>();

  const seenPerformers = new Set<string>();
  /** Patient id -> how many Medical Escort or Fit Bionics actions target them. */
  const doctorVisits = new Map<string, number>();
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

    if (!canPerformPostCycleAction(performer, assignment.action, context)) {
      issues.push({
        fighterId: assignment.fighterId,
        message: `${label} cannot perform ${POST_CYCLE_ACTIONS[assignment.action].label}.`,
      });
    }

    switch (assignment.action) {
      case 'work_territory':
        workTerritoryCount += 1;
        break;

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
        doctorVisits.set(target.id, (doctorVisits.get(target.id) ?? 0) + 1);

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
        if (assignment.goodStuffSteps < 0 || !Number.isInteger(assignment.goodStuffSteps)) {
          issues.push({
            fighterId: assignment.fighterId,
            message: `${label}'s extra supplies must be a whole number of steps.`,
          });
        }
        break;
      }

      case 'develop_tactics': {
        if (assignment.tacticsCardIds.length === 0) {
          issues.push({
            fighterId: assignment.fighterId,
            message: `Choose at least one Gang Tactic for ${label}.`,
          });
        }

        if (
          new Set(assignment.tacticsCardIds).size !== assignment.tacticsCardIds.length
        ) {
          issues.push({
            fighterId: assignment.fighterId,
            message: `${label} has the same Gang Tactic selected twice.`,
          });
        }

        for (const cardId of assignment.tacticsCardIds) {
          if (ownedTacticsCardIds.has(cardId)) {
            issues.push({
              fighterId: assignment.fighterId,
              message: `The gang already holds one of the Gang Tactics ${label} picked.`,
            });
            continue;
          }

          // The insert ignores duplicates, so a second claim would silently add nothing.
          const claimedBy = claimedTacticsCards.get(cardId);
          if (claimedBy && claimedBy !== assignment.fighterId) {
            issues.push({
              fighterId: assignment.fighterId,
              message:
                `${label} and ${claimedBy} both picked the same Gang Tactic. ` +
                `A gang can only hold one copy of a card.`,
            });
            continue;
          }
          claimedTacticsCards.set(cardId, label);
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

  // One trip to the Doc per patient, and a patient takes no action of their own.
  for (const [patientId, count] of doctorVisits) {
    const name = byId.get(patientId)?.fighter_name ?? 'A fighter';
    if (count > 1) {
      issues.push({
        fighterId: patientId,
        message: `${name} can only be taken to the Doc once per Post-cycle Sequence.`,
      });
    }
    if (seenPerformers.has(patientId)) {
      issues.push({
        fighterId: patientId,
        message: `${name} is being taken to the Doc and cannot perform a Post-cycle Action.`,
      });
    }
  }

  return issues;
}
