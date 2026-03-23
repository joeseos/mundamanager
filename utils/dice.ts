// Dice utilities and roll tables (injuries, vehicles, ganger advancement, etc.)

export const roll = (sides: number): number => Math.floor(Math.random() * sides) + 1;

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
  { range: [14, 14], name: 'Bitter Enmity' },
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

export const resolveInjuryFromUtil = (roll: number): TableEntry | undefined =>
  LASTING_INJURY_TABLE.find((e) => roll >= e.range[0] && roll <= e.range[1]);

// Keeping resolve by name for optional diagnostics/UI usage
export const resolveInjuryRangeFromUtilByName = (
  name: string,
): [number, number] | undefined => {
  const entry = LASTING_INJURY_TABLE.find((e) => e.name === name);
  return entry?.range;
};

// ============================================================================
// Lasting Injuries for Crew - D66 table and resolver
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

export const resolveInjuryFromUtilCrew = (roll: number): TableEntry | undefined =>
  LASTING_INJURY_CREW_TABLE.find((e) => roll >= e.range[0] && roll <= e.range[1]);

// Keeping resolve by name for optional diagnostics/UI usage
export const resolveInjuryRangeFromUtilByNameCrew = (
  name: string,
): [number, number] | undefined => {
  const entry = LASTING_INJURY_CREW_TABLE.find((e) => e.name === name);
  return entry?.range;
};

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

export const resolveRigGlitchFromUtil = (roll: number): TableEntry | undefined =>
  RIG_GLITCH_TABLE.find((e) => roll >= e.range[0] && roll <= e.range[1]);

// Keeping resolve by name for optional diagnostics/UI usage
export const resolveRigGlitchRangeFromUtilByName = (
  name: string,
): [number, number] | undefined => {
  const entry = RIG_GLITCH_TABLE.find((e) => e.name === name);
  return entry?.range;
};

// ============================================================================
// Vehicle Lasting Damage - D6 table and resolver
// ============================================================================

export const VEHICLE_DAMAGE_TABLE: Record<number, string> = {
  1: 'Persistent Rattle',
  2: 'Handling Glitch',
  3: 'Unreliable',
  4: 'Loss of Power',
  5: 'Damaged Bodywork',
  6: 'Damaged Frame',
};

export const resolveVehicleDamageFromUtil = (d6: number): string | undefined =>
  VEHICLE_DAMAGE_TABLE[d6 as 1 | 2 | 3 | 4 | 5 | 6];

// Utility to look up the D6 value by damage name (optional)
export const getVehicleDamageRollForName = (name: string): number | undefined => {
  const found = Object.entries(VEHICLE_DAMAGE_TABLE).find(([, n]) => n === name);
  return found ? Number(found[0]) : undefined;
};

// ============================================================================
// Vehicle Repair - D6 table and resolver
// ============================================================================

export const VEHICLE_REPAIR_TABLE: TableEntry[] = [
  { range: [1, 3], name: 'Almost like new' },
  { range: [4, 5], name: 'Quality repairs' },
  { range: [6, 6], name: 'Superficial Damage' },
];

export const resolveVehicleRepairFromUtil = (d6: number): string | undefined => {
  const entry = VEHICLE_REPAIR_TABLE.find((e) => d6 >= e.range[0] && d6 <= e.range[1]);
  return entry?.name;
};

// Utility to look up the D6 value by repair name (optional)
export const getVehicleRepairRollForName = (name: string): number | undefined => {
  const entry = VEHICLE_REPAIR_TABLE.find((e) => e.name === name);
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
