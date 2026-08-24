// Dice utilities and roll tables (injuries, vehicles, ganger advancement, etc.)

import type { EditionSlug } from '@/types/edition';
import { BITTER_ENMITY_EFFECT_NAME } from '@/utils/injuryTarget';

export const roll = (sides: number): number => Math.floor(Math.random() * sides) + 1;

/** Roll a random integer in [min, max] (inclusive). */
export const rollInRange = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/** Three-sided die — not a multiple of D6; keep separate from `rollNd6`. */
export const rollD3 = (): number => roll(3);

function assertPositiveIntegerDiceCount(count: number, fnName: string): void {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError(`${fnName}: count must be a positive integer`);
  }
}

function rollNd6DiceValues(count: number): number[] {
  assertPositiveIntegerDiceCount(count, 'rollNd6');
  return Array.from({ length: count }, () => roll(6));
}

/** Sum of `count` D6 only (e.g. `rollNd6(2)` for 2D6). For per-die breakdown use `rollNd6Outcome`. */
export function rollNd6(count: number): number {
  return rollNd6DiceValues(count).reduce((sum, d) => sum + d, 0);
}

export const rollD6 = (): number => rollNd6(1);

export const rollD66 = (): number => rollD6() * 10 + rollD6();

/** Total and individual dice — used by DiceRoller for display (e.g. `Roll 11 (6, 5): …`). */
export type RollOutcome = { total: number; dice: number[] };

/** Inline / log-style line: `Roll 11 (6, 5): Outcome name` — shared by DiceRoller and pool rolls (use `[r]` for a single draw). */
export function formatRollOutcomeLine(total: number, dice: number[], resultLabel?: string): string {
  const diceStr = dice.join(', ');
  const core = `Roll ${total} (${diceStr})`;
  return resultLabel !== undefined && resultLabel !== '' ? `${core}: ${resultLabel}` : core;
}

/** Normalise a legacy `number` roll (shown as a single die) or a full outcome. */
export function normaliseRollFnResult(raw: number | RollOutcome): RollOutcome {
  if (typeof raw === 'object' && raw !== null && Array.isArray(raw.dice)) {
    return { total: raw.total, dice: [...raw.dice] };
  }
  const n = raw as number;
  return { total: n, dice: [n] };
}

/** Roll any number of D6 (1D6, 2D6, 4D6, …). `total` is the sum; `dice` is each die in order. */
export function rollNd6Outcome(count: number): RollOutcome {
  const dice = rollNd6DiceValues(count);
  const total = dice.reduce((sum, d) => sum + d, 0);
  return { total, dice };
}

/** D66: `total` is tens×10+ones; `dice` is [tens, ones], e.g. 52 → [5, 2]. */
export function rollD66Outcome(): RollOutcome {
  const tens = rollD6();
  const ones = rollD6();
  return { total: tens * 10 + ones, dice: [tens, ones] };
}

export type TableEntry = {
  range: [number, number];
  name: string;
  note?: string;
  is_multiple?: boolean;
  banned?: string[];
  /** Ganger / Exotic Beast advancement: specialist vs characteristic pair. */
  kind?: 'specialist' | 'pair';
  /** When `kind` is `pair`, the two characteristics to choose between. */
  pairOptions?: readonly [string, string];
};

// ============================================================================
// Lasting Injuries - D66 table and resolver
// ============================================================================

// D66 table for Lasting Injuries
export const LASTING_INJURY_TABLE: TableEntry[] = [
  { range: [11, 11], name: 'Lesson Learned' },
  { range: [12, 12], name: 'Impressive Scars' },
  { range: [13, 13], name: 'Horrid Scars' },
  { range: [14, 14], name: BITTER_ENMITY_EFFECT_NAME },
  { range: [15, 26], name: 'Out Cold' },
  { range: [31, 36], name: 'Convalescence' },
  { range: [41, 41], name: 'Old Battle Wound' },
  { range: [42, 42], name: 'Partially Deafened' },
  { range: [43, 43], name: 'Humiliated' },
  { range: [44, 44], name: 'Eye Injury' },
  { range: [45, 45], name: 'Hand Injury' },
  { range: [46, 46], name: 'Hobbled' },
  { range: [51, 51], name: 'Spinal Injury' },
  { range: [52, 52], name: 'Enfeebled' },
  { range: [53, 53], name: 'Head Injury' },
  { range: [54, 54], name: 'Multiple Injuries'},
  { range: [55, 56], name: 'Captured' },
  { range: [61, 65], name: 'Critical Injury' },
  { range: [66, 66], name: 'Memorable Death' },
];

// Resolvers are edition-scoped — see resolveInjuryFor / resolveInjuryRangeByNameFor below.

// ============================================================================
// Lasting Injuries for Crew - D66 table
// ============================================================================

// D66 table for Lasting Injuries for Crew
export const LASTING_INJURY_CREW_TABLE: TableEntry[] = [
  { range: [11, 11], name: 'Lesson Learned' },
  { range: [12, 26], name: 'Out Cold' },
  { range: [31, 46], name: 'Convalescence' },
  { range: [51, 52], name: 'Humiliated' },
  { range: [53, 54], name: 'Head Injury' },
  { range: [55, 56], name: 'Eye Injury' },
  { range: [61, 65], name: 'Critical Injury' },
  { range: [66, 66], name: 'Memorable Death' },
];

// ============================================================================
// Lasting Injuries (N26) - D66 table and resolver
// ============================================================================

// D66 table for Lasting Injuries, N26 ruleset.
//
// Not a reskin of the N23 table: N26 splits Bitter Enmity into three Hatred (X)
// variants by target (gang type / gang / model), replaces Convalescence with
// Grievous Wound over a wider 31-46 spread, shifts every characteristic injury
// down a row, and drops Old Battle Wound, Partially Deafened, Humiliated and
// Multiple Injuries entirely. There is no Mutations / Festering band, which is
// why lastingInjuryRankFor returns null for this edition.
//
// Note the N23 table spells 11 "Lesson Learned"; N26 spells it "Lesson Learnt".
// Both must match their own edition's fighter_effect_types.effect_name exactly,
// since ranges are a name-keyed reverse lookup.
export const LASTING_INJURY_TABLE_N26: TableEntry[] = [
  { range: [11, 11], name: 'Lesson Learnt' },
  { range: [12, 12], name: 'Eternal Enmity' },
  { range: [13, 13], name: BITTER_ENMITY_EFFECT_NAME },
  { range: [14, 14], name: 'Personal Enmity' },
  { range: [15, 15], name: 'Horrid Scars' },
  { range: [16, 16], name: 'Impressive Scars' },
  { range: [21, 26], name: 'Out Cold' },
  { range: [31, 46], name: 'Grievous Wound' },
  { range: [51, 51], name: 'Eye Injury' },
  { range: [52, 52], name: 'Hand Injury' },
  { range: [53, 53], name: 'Hobbled' },
  { range: [54, 54], name: 'Spinal Injury' },
  { range: [55, 55], name: 'Enfeebled' },
  { range: [56, 56], name: 'Head Injury' },
  { range: [61, 62], name: 'Captured' },
  { range: [63, 65], name: 'Critical Injury' },
  { range: [66, 66], name: 'Memorable Death' },
];

// ============================================================================
// Rig Glitches for Spyrers - D66 table and resolver
// ============================================================================

// D66 table for Rig Glitches (Spyrers)
export const RIG_GLITCH_TABLE: TableEntry[] = [
  { range: [11, 11], name: 'Lesson Learned' },
  { range: [12, 26], name: 'Superficial Damage' },
  { range: [31, 36], name: 'Convalescence' },
  { range: [41, 41], name: 'Humbled' },
  { range: [42, 42], name: 'Anxiety Suppression Damaged' },
  { range: [43, 43], name: 'Neural Feedback' },
  { range: [44, 44], name: 'Vox Ghosts' },
  { range: [45, 45], name: 'Weakened Polymers' },
  { range: [46, 46], name: 'Gyroscopic Destabilisation' },
  { range: [51, 51], name: 'Jammed Articulation' },
  { range: [52, 52], name: 'Disrupted Ammo Cables' },
  { range: [53, 53], name: 'System Downgrade' },
  { range: [54, 54], name: 'Cracked Power Cell' },
  { range: [55, 55], name: 'Reduced Power Distribution' },
  { range: [56, 56], name: 'Seized Locomotors' },
  { range: [61, 61], name: 'Targeting Uplink Disruption' },
  { range: [62, 62], name: 'Stuttering Servos' },
  { range: [63, 63], name: 'Damaged Musculature' },
  { range: [64, 64], name: 'Reduced Plate Density' },
  { range: [65, 65], name: 'Multiple Glitches' },
  { range: [66, 66], name: 'Critical Overload' },
];

// D66 table for Rig Glitches (Spyrers), N26 ruleset.
//
// Not a reskin of the N23 rig glitch table: N26 opens with the same six results
// as its lasting injury table (Lesson Learnt, the Enmity trio, the two Scars),
// widens Superficial Damage to 21-26, replaces Convalescence with Grievous
// Wound over 31-46, and drops Weakened Polymers, Jammed Articulation, Disrupted
// Ammo Cables, System Downgrade, Cracked Power Cell and Reduced Power
// Distribution. Only 51-64 raise the Glitch Count.
//
// effect_name must match the edition's fighter_effect_types rows exactly, since
// ranges are a name-keyed reverse lookup. Note 11 is 'Lesson Learnt' here and
// 'Lesson Learned' in RIG_GLITCH_TABLE; both are correct for their own edition.
export const RIG_GLITCH_TABLE_N26: TableEntry[] = [
  { range: [11, 11], name: 'Lesson Learnt' },
  { range: [12, 12], name: 'Eternal Enmity' },
  { range: [13, 13], name: BITTER_ENMITY_EFFECT_NAME },
  { range: [14, 14], name: 'Personal Enmity' },
  { range: [15, 15], name: 'Horrid Scars' },
  { range: [16, 16], name: 'Impressive Scars' },
  { range: [21, 26], name: 'Superficial Damage' },
  { range: [31, 46], name: 'Grievous Wound' },
  { range: [51, 51], name: 'Anxiety Suppression Damaged' },
  { range: [52, 52], name: 'Neural Feedback' },
  { range: [53, 53], name: 'Humbled' },
  { range: [54, 54], name: 'Vox Ghosts' },
  { range: [55, 55], name: 'Gyroscopic Destabilisation' },
  { range: [56, 56], name: 'Seized Locomotors' },
  { range: [61, 61], name: 'Targeting Uplink Disruption' },
  { range: [62, 62], name: 'Stuttering Servos' },
  { range: [63, 63], name: 'Damaged Musculature' },
  { range: [64, 64], name: 'Reduced Plate Density' },
  { range: [65, 65], name: 'Multiple Glitches' },
  { range: [66, 66], name: 'Critical Overload' },
];

// ============================================================================
// Edition-scoped injury table selection
// ============================================================================

/** The injury tables one edition publishes. `null` where it publishes none. */
type InjuryTables = {
  base: TableEntry[];
  crew: TableEntry[] | null;
  spyrer: TableEntry[] | null;
};

/**
 * Keyed by EditionSlug on purpose: adding an edition is a compile error here
 * until it states its injury tables, the same guarantee EDITION_CAPABILITIES
 * gives for capability flags and LIMITS_BY_EDITION gives for characteristics.
 *
 * This stays out of types/edition.ts because it selects a data table rather
 * than gating a behaviour — the same split as getEquipmentCategoryRank.
 */
const INJURY_TABLES_BY_EDITION: Record<EditionSlug, InjuryTables> = {
  n23: { base: LASTING_INJURY_TABLE, crew: LASTING_INJURY_CREW_TABLE, spyrer: RIG_GLITCH_TABLE },
  n26: { base: LASTING_INJURY_TABLE_N26, crew: null, spyrer: RIG_GLITCH_TABLE_N26 },
};

/**
 * An unset or unrecognised slug gets no table at all, so callers show no ranges
 * and resolve no rolls — matching NO_LIMITS and the capability registry. A missing slug
 * means the edition failed to load, and quietly serving another edition's D66
 * spread would silently apply the wrong injury to a fighter.
 */
const NO_INJURY_TABLES: InjuryTables = { base: [], crew: null, spyrer: null };

/**
 * The D66 table for one fighter, in one edition.
 *
 * The two fallbacks differ on purpose. A Crew fighter in an edition with no
 * separate crew table rolls on the normal table — crew still take lasting
 * injuries. A Spyrer in an edition with no rig glitch table gets nothing, since
 * Rig Glitches are a self-contained subsystem rather than a variant of the
 * normal table, and rolling normal injuries for a Spyrer rig would be wrong.
 */
export function lastingInjuryTableFor(
  editionSlug: string | null | undefined,
  opts: { isCrew?: boolean; isSpyrer?: boolean } = {},
): TableEntry[] {
  const tables = (editionSlug && INJURY_TABLES_BY_EDITION[editionSlug as EditionSlug])
    || NO_INJURY_TABLES;

  if (opts.isSpyrer) return tables.spyrer ?? [];
  if (opts.isCrew) return tables.crew ?? tables.base;
  return tables.base;
}

/** Resolve a D66 roll to its table entry for the given edition and fighter. */
export const resolveInjuryFor = (
  roll: number,
  editionSlug: string | null | undefined,
  opts: { isCrew?: boolean; isSpyrer?: boolean } = {},
): TableEntry | undefined =>
  lastingInjuryTableFor(editionSlug, opts).find((e) => roll >= e.range[0] && roll <= e.range[1]);

/** Reverse lookup: the D66 range an injury name occupies, for display. */
export const resolveInjuryRangeByNameFor = (
  name: string,
  editionSlug: string | null | undefined,
  opts: { isCrew?: boolean; isSpyrer?: boolean } = {},
): [number, number] | undefined =>
  lastingInjuryTableFor(editionSlug, opts).find((e) => e.name === name)?.range;

// ============================================================================
// Vehicle Lasting Damage - edition-scoped tables and resolvers
// ============================================================================

// D6 table, N23: mechanical faults that modify the attached `vehicles` row's statline.
export const VEHICLE_DAMAGE_TABLE_N23: TableEntry[] = [
  { range: [1, 1], name: 'Persistent Rattle' },
  { range: [2, 2], name: 'Handling Glitch' },
  { range: [3, 3], name: 'Unreliable' },
  { range: [4, 4], name: 'Loss of Power' },
  { range: [5, 5], name: 'Damaged Bodywork' },
  { range: [6, 6], name: 'Damaged Frame' },
];

// D66 table, N26. Not a reskin: the vehicle is a fighter here, so this modifies ordinary
// fighter characteristics and carries the Recovery / Captured / destroyed outcomes of the
// N26 injury table, Enmity trio included. Several names collide with N26 injuries and with
// VEHICLE_REPAIR_TABLE_N23; those are separate rows. effect_name must match
// 20260810120000_seed_n26_vehicle_lasting_damages.sql exactly — ranges reverse-look-up by name.
export const VEHICLE_DAMAGE_TABLE_N26: TableEntry[] = [
  { range: [11, 11], name: 'Lesson Learnt' },
  { range: [12, 12], name: 'Eternal Enmity' },
  { range: [13, 13], name: BITTER_ENMITY_EFFECT_NAME },
  { range: [14, 14], name: 'Personal Enmity' },
  { range: [15, 16], name: 'Percussive Repair' },
  { range: [21, 26], name: 'Superficial Damage' },
  { range: [31, 46], name: 'Major Damage' },
  { range: [51, 52], name: 'Busted Sights' },
  { range: [53, 53], name: 'Drive System Fault' },
  { range: [54, 54], name: 'Buckled Frame' },
  { range: [55, 56], name: 'Engine Fracture' },
  { range: [61, 62], name: 'Captured' },
  { range: [63, 65], name: 'Critical Damage' },
  { range: [66, 66], name: 'Catastrophic Explosion!' },
];

/** The dice kind travels with the table so callers never branch on the edition slug. */
export type VehicleDamageTable = {
  entries: TableEntry[];
  dice: 'd6' | 'd66';
};

/** Keyed by EditionSlug so a new edition is a compile error until it states its table. */
const VEHICLE_DAMAGE_BY_EDITION: Record<EditionSlug, VehicleDamageTable> = {
  n23: { entries: VEHICLE_DAMAGE_TABLE_N23, dice: 'd6' },
  n26: { entries: VEHICLE_DAMAGE_TABLE_N26, dice: 'd66' },
};

/** No table for an unknown slug: serving another edition's spread would apply the wrong damage. */
const NO_VEHICLE_DAMAGE: VehicleDamageTable = { entries: [], dice: 'd6' };

/** The vehicle damage table for one edition, with the dice it is rolled on. */
export function vehicleDamageTableFor(
  editionSlug: string | null | undefined,
): VehicleDamageTable {
  return (editionSlug && VEHICLE_DAMAGE_BY_EDITION[editionSlug as EditionSlug])
    || NO_VEHICLE_DAMAGE;
}

/** Resolve a roll to its table entry for the given edition. */
export const resolveVehicleDamageFor = (
  roll: number,
  editionSlug: string | null | undefined,
): TableEntry | undefined =>
  vehicleDamageTableFor(editionSlug).entries.find((e) => roll >= e.range[0] && roll <= e.range[1]);

/** Reverse lookup: the range a damage name occupies, for display. */
export const resolveVehicleDamageRangeByNameFor = (
  name: string,
  editionSlug: string | null | undefined,
): [number, number] | undefined =>
  vehicleDamageTableFor(editionSlug).entries.find((e) => e.name === name)?.range;

// ============================================================================
// Vehicle Repair - edition-scoped models
// ============================================================================

export const VEHICLE_REPAIR_TABLE_N23: TableEntry[] = [
  { range: [1, 3], name: 'Almost like new' },
  { range: [4, 5], name: 'Quality repairs' },
  { range: [6, 6], name: 'Superficial Damage' },
];

/**
 * Different mechanics, not different numbers, hence a union:
 *  - `roll`: D6 for a repair quality, clears every damage, costs a % of the vehicle.
 *    'Almost like new' leaves a Persistent Rattle behind.
 *  - `per-damage`: pick any number of damages, flat cost each, nothing left behind.
 */
export type VehicleRepairModel =
  | { kind: 'roll'; entries: TableEntry[] }
  | { kind: 'per-damage'; costPerDamage: number };

const VEHICLE_REPAIR_BY_EDITION: Record<EditionSlug, VehicleRepairModel> = {
  n23: { kind: 'roll', entries: VEHICLE_REPAIR_TABLE_N23 },
  n26: { kind: 'per-damage', costPerDamage: 50 },
};

/** How this edition repairs vehicle damage, or null where it publishes no rules. */
export const vehicleRepairModelFor = (
  editionSlug: string | null | undefined,
): VehicleRepairModel | null =>
  (editionSlug && VEHICLE_REPAIR_BY_EDITION[editionSlug as EditionSlug]) || null;

export const resolveVehicleRepairFromUtil = (d6: number): string | undefined => {
  const entry = VEHICLE_REPAIR_TABLE_N23.find((e) => d6 >= e.range[0] && d6 <= e.range[1]);
  return entry?.name;
};

// Utility to look up the D6 value by repair name (optional)
export const getVehicleRepairRollForName = (name: string): number | undefined => {
  const entry = VEHICLE_REPAIR_TABLE_N23.find((e) => e.name === name);
  return entry ? entry.range[0] : undefined;
};

// ============================================================================
// Power Boosts for Spyrers - D6 table and resolver
// ============================================================================

// D6 table for Power Boosts (Spyrers)
export const POWER_BOOST_TABLE: TableEntry[] = [
  { range: [1, 1], name: 'Combat Neuroware' },
  { range: [2, 2], name: 'Heightened Reactions' },
  { range: [3, 3], name: 'Improved Motive Power' },
  { range: [4, 4], name: 'Thickened Armour' },
  { range: [5, 6], name: 'Hunting Rig Augmentation' },
];

export const resolvePowerBoostFromUtil = (roll: number): TableEntry | undefined =>
  POWER_BOOST_TABLE.find((e) => roll >= e.range[0] && roll <= e.range[1]);

// Keeping resolve by name for optional diagnostics/UI usage
export const resolvePowerBoostRangeFromUtilByName = (
  name: string,
): [number, number] | undefined => {
  const entry = POWER_BOOST_TABLE.find((e) => e.name === name);
  return entry?.range;
};

// ============================================================================
// Ganger / Exotic Beast Advancement - 2D6 table
// ============================================================================

// 2D6 table for Ganger / Exotic Beast Advancement
export const GANGER_EXOTIC_BEAST_ADVANCEMENT_TABLE: TableEntry[] = [
  { range: [2, 2], name: 'Become Specialist and gain a random Primary skill', kind: 'specialist' },
  { range: [3, 4], name: '+1 Weapon Skill or Ballistic Skill', kind: 'pair', pairOptions: ['Weapon Skill', 'Ballistic Skill'] },
  { range: [5, 6], name: '+1 Strength or Toughness', kind: 'pair', pairOptions: ['Strength', 'Toughness'] },
  { range: [7, 7], name: '+1" Movement or +1 Initiative', kind: 'pair', pairOptions: ['Movement', 'Initiative'] },
  { range: [8, 9], name: '+1 Willpower or Intelligence', kind: 'pair', pairOptions: ['Willpower', 'Intelligence'] },
  { range: [10, 11], name: '+1 Leadership or Cool', kind: 'pair', pairOptions: ['Leadership', 'Cool'] },
  { range: [12, 12], name: 'Become Specialist and gain a random Primary skill', kind: 'specialist' },
];

export const resolveGangerExoticBeastAdvancementFromUtil = (roll: number): TableEntry | undefined =>
  GANGER_EXOTIC_BEAST_ADVANCEMENT_TABLE.find((e) => roll >= e.range[0] && roll <= e.range[1]);

export const resolveGangerExoticBeastAdvancementRangeFromUtilByName = (
  name: string
): [number, number] | undefined => {
  const entry = GANGER_EXOTIC_BEAST_ADVANCEMENT_TABLE.find((e) => e.name === name);
  return entry?.range;
};

// ============================================================================
// N26 Advancement - 2D6 table
// ============================================================================

/**
 * One result on the N26 Advancement table.
 *
 * A result may offer characteristics, skills or both: rolling a 2 offers +1
 * Leadership, +1 Intelligence *or* a random Primary skill. `credits` is the
 * increase to the model's Credits Value, which is fixed per result rather than
 * per characteristic — unlike N23, where it varies by fighter subtype.
 *
 * `skillAcquisitionTypeIds` are the ids get_available_skills returns, so a
 * skill result feeds the existing skill picker directly.
 */
export type N26AdvancementEntry = {
  range: [number, number];
  name: string;
  credits: number;
  /** Characteristic effect_names this result may improve. */
  characteristics?: readonly string[];
  /** Skill acquisition types this result may award. */
  skillAcquisitionTypeIds?: readonly string[];
};

/**
 * The player may take ANY result they rolled high enough for, so a roll sets an
 * upper bound rather than picking a row. Nothing here enforces that: the roll is
 * logged and the player selects a result, matching how the N23 Ganger table
 * already behaves.
 */
export const N26_ADVANCEMENT_TABLE: N26AdvancementEntry[] = [
  { range: [2, 2], name: '+1 Leadership, +1 Intelligence or a random Primary skill', credits: 5,
    characteristics: ['Leadership', 'Intelligence'], skillAcquisitionTypeIds: ['primary_random'] },
  { range: [3, 4], name: '+1 Cool or +1 Willpower', credits: 5,
    characteristics: ['Cool', 'Willpower'] },
  { range: [5, 5], name: 'A new Primary skill or a random Secondary skill', credits: 10,
    skillAcquisitionTypeIds: ['primary_selected', 'secondary_random'] },
  { range: [6, 6], name: '+1 Initiative or +1" Movement', credits: 10,
    characteristics: ['Initiative', 'Movement'] },
  { range: [7, 8], name: 'A new Secondary skill', credits: 15,
    skillAcquisitionTypeIds: ['secondary_selected'] },
  { range: [9, 9], name: '+1 Weapon Skill or +1 Ballistic Skill', credits: 15,
    characteristics: ['Weapon Skill', 'Ballistic Skill'] },
  { range: [10, 10], name: '+1 Strength or +1 Toughness', credits: 20,
    characteristics: ['Strength', 'Toughness'] },
  { range: [11, 11], name: '+1 Wounds, +1 Attacks or +1 Save', credits: 20,
    characteristics: ['Wounds', 'Attacks', 'Save'] },
  // A 12 lifts the Skill Set restriction entirely — any set, including sets
  // exclusive to other gangs and Inherent skills. The model's own Type/Subtype
  // gate still applies and is never lifted.
  { range: [12, 12], name: 'Any skill', credits: 30,
    skillAcquisitionTypeIds: ['primary_selected', 'secondary_selected', 'any_random'] },
];

export const resolveN26AdvancementFromUtil = (roll: number): N26AdvancementEntry | undefined =>
  N26_ADVANCEMENT_TABLE.find((e) => roll >= e.range[0] && roll <= e.range[1]);
