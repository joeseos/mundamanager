// Dice utilities and Lasting Injury D66 mapping

export const roll = (sides: number): number => Math.floor(Math.random() * sides) + 1;
export const rollD6 = (): number => roll(6);
export const rollD3 = (): number => roll(3);
export const rollD66 = (): number => rollD6() * 10 + rollD6();

export type TableEntry = {
  range: [number, number];
  name: string;
  note?: string;
  is_multiple?: boolean;
  banned?: string[];
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


