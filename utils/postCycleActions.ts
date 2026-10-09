/**
 * N26 Post-cycle Sequence rules, shared by the form and the server action. The
 * server re-runs validatePostCycleAssignment on its own reads before applying.
 */

import type { FighterEffect } from '@/types/fighter-effect';
import { hasGangTacticsCards } from '@/types/edition';
import { countsTowardRating } from '@/utils/fighter-status';

export type PostCycleActionId =
  | 'medical_escort'
  | 'fit_bionics'
  | 'develop_tactics'
  | 'visit_chop_shop'
  | 'work_territory'
  | 'visit_trading_post'
  | 'lead_ritual'
  | 'ritual_focus'
  | 'death_rites'
  | 'enhance_weapon'
  | 'suit_evolution'
  | 'suit_maintenance'
  | 'terrorise_territory'
  | 'train';

/**
 * Subtypes match fighters.fighter_subtypes; `vehicle` means fighters.is_vehicle;
 * `fighter` is any model that is not a vehicle.
 */
type Performer =
  | { kind: 'subtypes'; subtypes: readonly string[] }
  | { kind: 'vehicle' }
  | { kind: 'fighter' }
  | { kind: 'any' };

export interface PostCycleActionDefinition {
  id: PostCycleActionId;
  label: string;
  summary: string;
  performer: Performer;
  /** Spyrers get only the Spyre Hunters list's actions, not the standard ones. */
  openToSpyrers?: boolean;
  /** How many fighters may take it in one sequence; held by the panel. */
  maxFighters?: number;
  /** Offered only when the gang has this. */
  requires?: keyof PostCycleAvailability;
  /** Flat credits it moves, negative for a spend. Fit Bionics is priced per injury. */
  credits?: number;
}

export const MEDICAL_ESCORT_COST = 30;
export const FIT_BIONICS_COST_PER_INJURY = 50;
const WORK_TERRITORY_INCOME = 15;
const TERRORISE_TERRITORY_INCOME = 10;
export const TRAIN_XP = 2;
export const SUIT_EVOLUTION_KILL_COST = 4;

const TERRITORY_MAX_FIGHTERS = 5;

/** Must match the seeded N26 effect_name exactly. */
export const CRITICAL_INJURY_EFFECT_NAME = 'Critical Injury';

const LEADER = ['leader'] as const;
const LEADER_CHAMPION = ['leader', 'champion'] as const;
const LEADER_CHAMPION_GANGER_PROSPECT = ['leader', 'champion', 'ganger', 'prospect'] as const;
/**
 * The subtype, not fighter_types.is_spyrer: that flag is also set on the
 * Caryatid Prime, a pet with no hunting rig.
 */
const SPYRER = ['spyrer'] as const;

export const POST_CYCLE_ACTIONS: Record<PostCycleActionId, PostCycleActionDefinition> = {
  medical_escort: {
    id: 'medical_escort',
    label: 'Medical Escort',
    summary: `${MEDICAL_ESCORT_COST} credits + D6`,
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION },
    credits: -MEDICAL_ESCORT_COST,
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
    maxFighters: TERRITORY_MAX_FIGHTERS,
    credits: WORK_TERRITORY_INCOME,
  },
  develop_tactics: {
    id: 'develop_tactics',
    label: 'Develop Tactics',
    summary: 'Logged only',
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION },
    requires: 'tacticsCardsAvailable',
  },
  visit_trading_post: {
    id: 'visit_trading_post',
    label: 'Visit Trading Post',
    summary: 'Logged only',
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION },
  },
  lead_ritual: {
    id: 'lead_ritual',
    label: 'Lead Ritual',
    summary: 'Logged only',
    performer: { kind: 'subtypes', subtypes: LEADER },
    requires: 'chaosRitualsAvailable',
  },
  ritual_focus: {
    id: 'ritual_focus',
    label: 'Ritual Focus',
    summary: 'Logged only',
    performer: { kind: 'fighter' },
    maxFighters: 1,
    requires: 'chaosRitualsAvailable',
  },
  death_rites: {
    id: 'death_rites',
    label: 'Death Rites',
    summary: 'Logged only',
    performer: { kind: 'fighter' },
    requires: 'deathRitesAvailable',
  },
  enhance_weapon: {
    id: 'enhance_weapon',
    label: 'Enhance Weapon',
    summary: 'Logged only',
    performer: { kind: 'fighter' },
    requires: 'enhanceWeaponAvailable',
  },
  suit_evolution: {
    id: 'suit_evolution',
    label: 'Suit Evolution',
    summary: 'Logged only',
    performer: { kind: 'subtypes', subtypes: SPYRER },
    openToSpyrers: true,
  },
  suit_maintenance: {
    id: 'suit_maintenance',
    label: 'Suit Maintenance',
    summary: 'Logged only',
    performer: { kind: 'subtypes', subtypes: SPYRER },
    openToSpyrers: true,
  },
  terrorise_territory: {
    id: 'terrorise_territory',
    label: 'Terrorise Territory',
    summary: `+${TERRORISE_TERRITORY_INCOME} credits`,
    performer: { kind: 'subtypes', subtypes: SPYRER },
    openToSpyrers: true,
    maxFighters: TERRITORY_MAX_FIGHTERS,
    credits: TERRORISE_TERRITORY_INCOME,
  },
  // On both lists.
  train: {
    id: 'train',
    label: 'Train',
    summary: `+${TRAIN_XP} XP`,
    performer: { kind: 'any' },
    openToSpyrers: true,
  },
};

/**
 * Display order, derived from the catalog so a new action cannot be added to
 * one and forgotten in the other. Key order above is the display order.
 */
export const POST_CYCLE_ACTION_ORDER = Object.keys(
  POST_CYCLE_ACTIONS
) as PostCycleActionId[];

/** One gang log type per action, so the log can be filtered by it. */
export const postCycleLogType = (action: PostCycleActionId) => `post_cycle_${action}`;

export const POST_CYCLE_LOG_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  POST_CYCLE_ACTION_ORDER.map((id) => [postCycleLogType(id), POST_CYCLE_ACTIONS[id].label])
);

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
  kill_count?: number;
  effects?: { injuries?: FighterEffect[] };
}

/** Performers only: a Doc patient is always in Recovery, so targets skip this. */
export function canActInPostCycle(fighter: PostCycleFighter): boolean {
  return countsTowardRating(fighter) && !fighter.recovery;
}

function hasSubtype(fighter: PostCycleFighter, subtypes: readonly string[]): boolean {
  const owned = (fighter.fighter_subtypes ?? []).map((s) => s.toLowerCase());
  return subtypes.some((wanted) => owned.includes(wanted));
}

/** What the gang has, beyond its fighters, that some actions depend on. */
export interface PostCycleAvailability {
  tacticsCardsAvailable: boolean;
  chaosRitualsAvailable: boolean;
  deathRitesAvailable: boolean;
  enhanceWeaponAvailable: boolean;
}

/** The gang facts PostCycleAvailability is worked out from; the gang page already loads them. */
export interface PostCycleGang {
  editionSlug?: string | null;
  gangType?: string | null;
  isCustomGangType: boolean;
  subtypeNames: readonly string[];
}

const CHAOS_HELOTS_GANG_TYPE = 'chaos helots';
const CHAOS_CORRUPTED_GANG_SUBTYPE = 'chaos corrupted';
const CHYMIST_CULT_GANG_TYPE = 'chymist cult';
const FURNACE_BRUTES_GANG_TYPE = 'furnace brutes';

/**
 * Gang types and subtypes are matched by name, like isVenatorGang. A custom
 * gang type's name is the user's own, so it never counts.
 */
export function postCycleAvailability(gang: PostCycleGang): PostCycleAvailability {
  const gangType = gang.isCustomGangType ? '' : (gang.gangType ?? '').toLowerCase();
  const subtypes = gang.subtypeNames.map((name) => name.toLowerCase());

  return {
    tacticsCardsAvailable: hasGangTacticsCards(gang.editionSlug),
    chaosRitualsAvailable:
      gangType === CHAOS_HELOTS_GANG_TYPE || subtypes.includes(CHAOS_CORRUPTED_GANG_SUBTYPE),
    // Alternate Escher and Goliath lists, each stored as its own gang type.
    deathRitesAvailable: gangType === CHYMIST_CULT_GANG_TYPE,
    enhanceWeaponAvailable: gangType === FURNACE_BRUTES_GANG_TYPE,
  };
}

export function canPerformPostCycleAction(
  fighter: PostCycleFighter,
  actionId: PostCycleActionId,
  availability: PostCycleAvailability
): boolean {
  if (!canActInPostCycle(fighter)) return false;

  const { performer, openToSpyrers, requires } = POST_CYCLE_ACTIONS[actionId];
  if (requires && !availability[requires]) return false;
  if (!openToSpyrers && hasSubtype(fighter, SPYRER)) return false;

  switch (performer.kind) {
    case 'any':
      return true;
    case 'fighter':
      return !fighter.is_vehicle;
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
  | { fighterId: string; action: 'medical_escort'; targetFighterId: string }
  | { fighterId: string; action: 'fit_bionics'; targetFighterId: string; injuryIds: string[] }
  | { fighterId: string; action: Exclude<PostCycleActionId, 'medical_escort' | 'fit_bionics'> };

/** The fighter taken to the Doc, for the two actions that have one. */
export const patientOf = (assignment: PostCycleAssignment): string | null =>
  'targetFighterId' in assignment ? assignment.targetFighterId : null;

/** Negative spends. */
export function assignmentCreditsDelta(assignment: PostCycleAssignment): number {
  if (assignment.action === 'fit_bionics') {
    return -(assignment.injuryIds.length * FIT_BIONICS_COST_PER_INJURY);
  }
  return POST_CYCLE_ACTIONS[assignment.action].credits ?? 0;
}

/**
 * Everything one action must satisfy on its own: can the performer take it, and
 * is the target still a legal one. Returns the problems, if any.
 */
export function validatePostCycleAssignment(
  fighters: PostCycleFighter[],
  assignment: PostCycleAssignment,
  availability: PostCycleAvailability
): string[] {
  const issues: string[] = [];
  const byId = new Map(fighters.map((f) => [f.id, f]));
  const performer = byId.get(assignment.fighterId);

  if (!performer) return ['Fighter is not part of this gang.'];

  const label = performer.fighter_name;

  if (!canPerformPostCycleAction(performer, assignment.action, availability)) {
    issues.push(`${label} cannot perform ${POST_CYCLE_ACTIONS[assignment.action].label}.`);
  }

  switch (assignment.action) {
    case 'medical_escort':
    case 'fit_bionics': {
      const target = byId.get(assignment.targetFighterId);
      if (!target || target.id === performer.id || !countsTowardRating(target)) {
        issues.push(`${label} cannot take that fighter to the Doc.`);
      } else if (assignment.action === 'medical_escort' && !hasCriticalInjury(target)) {
        issues.push(`${target.fighter_name} has no Critical Injury to treat.`);
      } else if (assignment.action === 'fit_bionics') {
        const removable = new Set(removableLastingInjuriesOf(target).map((e) => e.id));
        if (assignment.injuryIds.length === 0 || !assignment.injuryIds.every((id) => removable.has(id))) {
          issues.push(`Choose Lasting Injuries that ${target.fighter_name} has.`);
        }
      }
      break;
    }

    case 'suit_evolution':
      if ((performer.kill_count ?? 0) < SUIT_EVOLUTION_KILL_COST) {
        issues.push(`${label} needs a Kill Count of at least ${SUIT_EVOLUTION_KILL_COST}.`);
      }
      break;
  }

  return issues;
}
