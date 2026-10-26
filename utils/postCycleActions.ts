/**
 * N26 Post-cycle Sequence rules, shared by the form and the server action. The
 * server re-runs validatePostCycleAssignment on its own reads before applying.
 */

import type { FighterEffect } from '@/types/fighter-effect';
import { hasGangTacticsCards } from '@/types/edition';
import { CHOP_SHOP_COST_PER_DAMAGE } from '@/utils/dice';
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
  | 'grubs_up'
  | 'train';

/**
 * Subtypes match fighters.fighter_subtypes; `fighterType` matches
 * fighters.fighter_type by name; `vehicle` means fighters.is_vehicle;
 * `fighter` is any model that is not a vehicle.
 */
type Performer =
  | { kind: 'subtypes'; subtypes: readonly string[] }
  | { kind: 'fighterType'; fighterType: string }
  | { kind: 'vehicle' }
  | { kind: 'fighter' }
  | { kind: 'any' };

export interface PostCycleActionDefinition {
  id: PostCycleActionId;
  label: string;
  /** Follows the label in the action picker, so it has to fit one line on a phone. */
  summary: string;
  performer: Performer;
  /** Spyrers get only the Spyre Hunters list's actions, not the standard ones. */
  openToSpyrers?: boolean;
  /** How many fighters may take it in one sequence; held by the panel. */
  maxFighters?: number;
  /** Offered only when the gang has this. */
  requires?: keyof PostCycleAvailability;
  /**
   * Flat credits it moves, negative for a spend. Fit Bionics and Visit Chop Shop
   * price each injury or damage, and a Doc discount can lower either Doc action.
   */
  credits?: number;
}

export const MEDICAL_ESCORT_COST = 30;
export const FIT_BIONICS_COST_PER_INJURY = 50;
/** Set by the N26 vehicle repair model, so the Repair Damage modal charges the same. */
export { CHOP_SHOP_COST_PER_DAMAGE };
const WORK_TERRITORY_INCOME = 15;
const TERRORISE_TERRITORY_INCOME = 10;
const GRUBS_UP_INCOME = 20;
export const TRAIN_XP = 2;
export const SUIT_EVOLUTION_KILL_COST = 4;
export const SUIT_MAINTENANCE_COST = 100;
const REPUTATION_INCOME_PER_POINT = 10;

/** Collect Income: credits equal to 10x Reputation, on top of the territory Boons. */
export const reputationIncome = (reputation: number): number =>
  Math.max(reputation, 0) * REPUTATION_INCOME_PER_POINT;

/**
 * Fighters whose own rule opens a Doc action to them, at a discount taken off
 * the action's whole cost, never below 0. Keyed by fighters.fighter_type, like
 * the Slopper's Grub's Up, so every list's Chem Wytch or Forge Patcher counts.
 */
const DOC_DISCOUNTS: Record<string, Partial<Record<PostCycleActionId, number>>> = {
  // Tend Patient
  'chem wytch': { medical_escort: 20 },
  // Back to the Forge!
  'forge patcher': { fit_bionics: 20 },
  // Patch-Up
  'rogue doc': { medical_escort: 50, fit_bionics: 50 },
};

export function postCycleDiscount(fighter: PostCycleFighter, action: PostCycleActionId): number {
  return DOC_DISCOUNTS[fighter.fighter_type?.toLowerCase() ?? '']?.[action] ?? 0;
}

const discounted = (cost: number, discount: number) => Math.max(cost - discount, 0);

export const medicalEscortCost = (performer: PostCycleFighter): number =>
  discounted(MEDICAL_ESCORT_COST, postCycleDiscount(performer, 'medical_escort'));

/** The discount comes off the total, not each injury. */
export const fitBionicsCost = (performer: PostCycleFighter, injuries: number): number =>
  discounted(injuries * FIT_BIONICS_COST_PER_INJURY, postCycleDiscount(performer, 'fit_bionics'));

/**
 * Fighters whose own rule lets them take an action their class normally can't,
 * keyed by fighters.fighter_type like DOC_DISCOUNTS.
 */
const OWN_RULE_ACTIONS: Record<string, readonly PostCycleActionId[]> = {
  // Excavation Automata: a Brute
  "luther pattern excavation automata ('ambot')": ['work_territory'],
  // Agitate the Masses: a Hanger-on
  agitator: ['work_territory'],
  // Hangers-on who trade for the gang
  fixer: ['visit_trading_post'],
  scabber: ['visit_trading_post'],
  'underhive trader': ['visit_trading_post'],
};

/** The Connected skill opens Visit Trading Post to any fighter who has it. */
const hasOwnRuleFor = (fighter: PostCycleFighter, action: PostCycleActionId): boolean =>
  (OWN_RULE_ACTIONS[fighter.fighter_type?.toLowerCase() ?? '']?.includes(action) ?? false) ||
  (action === 'visit_trading_post' && fighter.skills?.Connected !== undefined);

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
    // No flat credits: medicalEscortCost prices it, Doc discount included.
  },
  fit_bionics: {
    id: 'fit_bionics',
    label: 'Fit Bionics',
    summary: 'Remove Lasting Injuries',
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION },
  },
  visit_chop_shop: {
    id: 'visit_chop_shop',
    label: 'Visit Chop Shop',
    summary: 'Repair Damage',
    performer: { kind: 'vehicle' },
  },
  work_territory: {
    id: 'work_territory',
    label: 'Work Territory',
    summary: `+${WORK_TERRITORY_INCOME} credits`,
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION_GANGER_PROSPECT },
    // No cap: some fighters and gangs may work more than five, and house rules vary.
    credits: WORK_TERRITORY_INCOME,
  },
  develop_tactics: {
    id: 'develop_tactics',
    label: 'Develop Tactics',
    summary: 'Add a Gang Tactic',
    performer: { kind: 'subtypes', subtypes: LEADER_CHAMPION },
    requires: 'tacticsCardsAvailable',
  },
  visit_trading_post: {
    id: 'visit_trading_post',
    label: 'Visit Trading Post',
    summary: 'Gain Trade Points',
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
    summary: 'Clear Glitches',
    performer: { kind: 'subtypes', subtypes: SPYRER },
    openToSpyrers: true,
    credits: -SUIT_MAINTENANCE_COST,
  },
  terrorise_territory: {
    id: 'terrorise_territory',
    label: 'Terrorise Territory',
    summary: `+${TERRORISE_TERRITORY_INCOME} credits`,
    performer: { kind: 'subtypes', subtypes: SPYRER },
    openToSpyrers: true,
    // No cap, like Work Territory, so house rules can allow more than five.
    credits: TERRORISE_TERRITORY_INCOME,
  },
  // The Slopper's own rule rather than a list's.
  grubs_up: {
    id: 'grubs_up',
    label: "Grub's Up",
    summary: `+${GRUBS_UP_INCOME} credits`,
    performer: { kind: 'fighterType', fighterType: 'slopper' },
    credits: GRUBS_UP_INCOME,
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

/** What the Post-cycle log records: each fighter action, and the gang's Collect Income. */
export type PostCycleLogStep = PostCycleActionId | 'collect_income';

/** One gang log type per step, so the log can be filtered by it. */
export const postCycleLogType = (step: PostCycleLogStep) => `post_cycle_${step}`;

export const POST_CYCLE_LOG_TYPE_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    POST_CYCLE_ACTION_ORDER.map((id) => [postCycleLogType(id), POST_CYCLE_ACTIONS[id].label])
  ),
  [postCycleLogType('collect_income')]: 'Collect Income',
};

/** The fighter fields these rules read, shared by FighterProps and GangFighter. */
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
  kill_count?: number;
  /** Keyed by skill name. */
  skills?: Record<string, unknown>;
  effects?: {
    injuries?: FighterEffect[];
    'lasting damages'?: FighterEffect[];
    'rig-glitches'?: FighterEffect[];
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

/** Visit Trading Post: a Leader brings back 2 Trade Points, any other visitor 1. */
export const tradingPostTradePoints = (performer: PostCycleFighter): number =>
  hasSubtype(performer, LEADER) ? 2 : 1;

export const tradePointsText = (points: number): string =>
  `${points} Trade Point${points === 1 ? '' : 's'}`;

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
  if (postCycleDiscount(fighter, actionId) > 0 || hasOwnRuleFor(fighter, actionId)) {
    return !fighter.is_vehicle;
  }

  switch (performer.kind) {
    case 'any':
      return true;
    case 'fighter':
      return !fighter.is_vehicle;
    case 'vehicle':
      return fighter.is_vehicle === true;
    case 'subtypes':
      return !fighter.is_vehicle && hasSubtype(fighter, performer.subtypes);
    case 'fighterType':
      return fighter.fighter_type?.toLowerCase() === performer.fighterType;
  }
}

export function eligiblePostCycleActions(
  fighter: PostCycleFighter,
  availability: PostCycleAvailability
): PostCycleActionDefinition[] {
  return POST_CYCLE_ACTION_ORDER.filter((id) =>
    canPerformPostCycleAction(fighter, id, availability)
  ).map((id) => {
    const action = POST_CYCLE_ACTIONS[id];
    const discount = postCycleDiscount(fighter, id);
    if (discount === 0) return action;
    return {
      ...action,
      summary:
        id === 'medical_escort'
          ? `${medicalEscortCost(fighter)} credits + D6`
          : `From ${fitBionicsCost(fighter, 1)} credits`,
    };
  });
}

const injuriesOf = (fighter: PostCycleFighter): FighterEffect[] =>
  fighter.effects?.injuries ?? [];

export const criticalInjuriesOf = (fighter: PostCycleFighter): FighterEffect[] =>
  injuriesOf(fighter).filter((e) => e.effect_name === CRITICAL_INJURY_EFFECT_NAME);

export const removableLastingInjuriesOf = (fighter: PostCycleFighter): FighterEffect[] =>
  injuriesOf(fighter).filter((e) => e.effect_name !== CRITICAL_INJURY_EFFECT_NAME);

export const hasCriticalInjury = (fighter: PostCycleFighter): boolean =>
  criticalInjuriesOf(fighter).length > 0;

/** An N26 vehicle is a fighter, so its Lasting Damage sits in its own effects. */
export const lastingDamagesOf = (fighter: PostCycleFighter): FighterEffect[] =>
  fighter.effects?.['lasting damages'] ?? [];

/** Suit Maintenance clears all of them, so there is nothing to pick. */
export const rigGlitchesOf = (fighter: PostCycleFighter): FighterEffect[] =>
  fighter.effects?.['rig-glitches'] ?? [];

/**
 * The names as the fighter card lists them, a repeated one counted:
 * "Superficial Damage (x2), Vox Ghosts".
 */
export function rigGlitchNames(glitches: FighterEffect[]): string {
  const counts = new Map<string, number>();
  for (const glitch of glitches) {
    counts.set(glitch.effect_name, (counts.get(glitch.effect_name) ?? 0) + 1);
  }
  return [...counts]
    .map(([name, count]) => (count > 1 ? `${name} (x${count})` : name))
    .join(', ');
}

export type PostCycleAssignment =
  | { fighterId: string; action: 'medical_escort'; targetFighterId: string }
  | { fighterId: string; action: 'fit_bionics'; targetFighterId: string; injuryIds: string[] }
  /** A tactics_cards id; the server checks it is one of the gang's packs. */
  | { fighterId: string; action: 'develop_tactics'; tacticsCardId: string }
  /** The vehicle's own Lasting Damage to repair. */
  | { fighterId: string; action: 'visit_chop_shop'; damageIds: string[] }
  | {
      fighterId: string;
      action: Exclude<
        PostCycleActionId,
        'medical_escort' | 'fit_bionics' | 'develop_tactics' | 'visit_chop_shop'
      >;
    };

/** The fighter taken to the Doc, for the two actions that have one. */
export const patientOf = (assignment: PostCycleAssignment): string | null =>
  'targetFighterId' in assignment ? assignment.targetFighterId : null;

/** Negative spends. The performer decides any Doc discount. */
export function assignmentCreditsDelta(
  assignment: PostCycleAssignment,
  performer: PostCycleFighter
): number {
  if (assignment.action === 'medical_escort') {
    return -medicalEscortCost(performer);
  }
  if (assignment.action === 'fit_bionics') {
    return -fitBionicsCost(performer, assignment.injuryIds.length);
  }
  if (assignment.action === 'visit_chop_shop') {
    return -(assignment.damageIds.length * CHOP_SHOP_COST_PER_DAMAGE);
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

    case 'visit_chop_shop': {
      const damaged = new Set(lastingDamagesOf(performer).map((e) => e.id));
      if (assignment.damageIds.length === 0 || !assignment.damageIds.every((id) => damaged.has(id))) {
        issues.push(`Choose Lasting Damage that ${label} has.`);
      }
      break;
    }

    case 'suit_evolution':
      if ((performer.kill_count ?? 0) < SUIT_EVOLUTION_KILL_COST) {
        issues.push(`${label} needs a Kill Count of at least ${SUIT_EVOLUTION_KILL_COST}.`);
      }
      break;

    case 'suit_maintenance':
      if (rigGlitchesOf(performer).length === 0) {
        issues.push(`${label} has no Rig Glitches to clear.`);
      }
      break;
  }

  return issues;
}
