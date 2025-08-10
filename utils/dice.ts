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

export const isMultipleFromUtil = (name: string): boolean =>
  LASTING_INJURY_TABLE.find((e) => e.name === name)?.is_multiple === true;

export const bannedFromUtil = (name: string): string[] =>
  LASTING_INJURY_TABLE.find((e) => e.name === name)?.banned ?? [];


