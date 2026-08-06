import type { EditionSlug } from '@/types/edition';
import { lastingInjuryCrewRank } from '@/utils/lastingInjuryCrewRank';
import { BITTER_ENMITY_EFFECT_NAME } from '@/utils/bitterEnmityDisplay';

export const lastingInjuryRank: { [key: string]: number } = {
  // Lasting Injuries
  [BITTER_ENMITY_EFFECT_NAME]: 1,
  "Captured": 2,
  "Convalescence": 3,
  "Critical Injury": 4,
  "Enfeebled": 5,
  "Eye Injury": 6,
  "Hand Injury": 7,
  "Head Injury": 8,
  "Hobbled": 9,
  "Horrid Scars": 10,
  "Humiliated": 11,
  "Impressive Scars": 12,
  "Lesson Learned": 13,
  "Memorable Death": 14,
  "Multiple Injuries": 15,
  "Old Battle Wound": 16,
  "Out Cold": 17,
  "Partially Deafened": 18,
  "Spinal Injury": 19,

  // Mutations / Festering Injuries
  "Bestial Senses": 30,
  "Crooked Body": 31,
  "Dark Madness": 32,
  "Disturbing Appendage": 33,
  "Hungering Pride": 34,
  "Twisted Flesh": 35,
  "Warped Limbs": 36,

  // Rig Glitches (for Spyrers)
  "Superficial Damage": 2,
  "Weakened Polymers": 8,
  "Reduced Power Distribution": 14,
  "Reduced Plate Density": 19,
  "Gyroscopic Destabilisation": 9,
  "Seized Locomotors": 15,
  "Multiple Glitches": 20,
  "Humbled": 4,
  "Jammed Articulation": 10,
  "Targeting Uplink Disruption": 16,
  "Critical Overload": 21,
  "Anxiety Suppression Damaged": 5,
  "Disrupted Ammo Cables": 11,
  "Neural Feedback": 6,
  "System Downgrade": 12,
  "Stuttering Servos": 17,
  "Vox Ghosts": 7,
  "Cracked Power Cell": 13,
  "Damaged Musculature": 18,
};

export type LastingInjuryRankMap = { [key: string]: number };

/**
 * Keyed by EditionSlug so adding an edition is a compile error until it states
 * whether it ranks injuries, mirroring INJURY_TABLES_BY_EDITION in utils/dice.
 *
 * `null` means the edition has no rank bands. N26 is flat: it publishes no
 * Mutations / Festering Injuries, and no separate Crew table, so there is
 * nothing to group by and nothing to allow-list against.
 */
const RANKS_BY_EDITION: Record<EditionSlug, { fighter: LastingInjuryRankMap; crew: LastingInjuryRankMap } | null> = {
  n23: { fighter: lastingInjuryRank, crew: lastingInjuryCrewRank },
  n26: null,
};

/**
 * The rank map used to group the injury picker, or `null` when the edition
 * ranks nothing (so callers list injuries flat, in D66 order).
 *
 * Callers must treat `null` as "skip grouping", not "rank everything Infinity".
 * The N23 crew map doubles as an allow-list — `hasOwnProperty` decides which
 * injuries a Crew fighter may take — so applying it to another edition would
 * empty the combobox rather than merely ungroup it.
 */
export function lastingInjuryRankFor(
  editionSlug: string | null | undefined,
  isCrew: boolean,
): LastingInjuryRankMap | null {
  const ranks = editionSlug ? RANKS_BY_EDITION[editionSlug as EditionSlug] : null;
  if (!ranks) return null;
  return isCrew ? ranks.crew : ranks.fighter;
}
