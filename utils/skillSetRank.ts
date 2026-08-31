import type { EditionSlug } from '@/types/edition';
import { skillSetRankN23 } from '@/utils/skillSetRankN23';
import { skillSetRankN26 } from '@/utils/skillSetRankN26';

export { skillSetRankN23 } from '@/utils/skillSetRankN23';
export { skillSetRankN26 } from '@/utils/skillSetRankN26';

/**
 * Keyed by EditionSlug so a new edition is a compile error here until it states
 * its own order, matching LIMITS_BY_EDITION, INJURY_TABLES_BY_EDITION and
 * CATEGORY_RANK_BY_EDITION.
 */
const SKILL_SET_RANK_BY_EDITION: Record<EditionSlug, { [key: string]: number }> = {
  n23: skillSetRankN23,
  n26: skillSetRankN26,
};

/**
 * Edition-scoped skill-set sort and group order. An unset or unrecognised slug
 * gets no ranking, so callers group everything under "Misc." rather than
 * borrowing another edition's order — the same choice the sibling registries
 * make. A caller landing here is a signal its edition never resolved.
 */
export function getSkillSetRank(
  editionSlug?: string | null
): { [key: string]: number } {
  if (!editionSlug) return {};
  return SKILL_SET_RANK_BY_EDITION[editionSlug as EditionSlug] ?? {};
}

/** Band label used when grouping Skill Sets in comboboxes and skill-access UIs. */
export function getSkillSetGroupLabel(rank: number): string {
  if (rank <= 19) return 'Universal Skill Sets';
  if (rank <= 39) return 'Gang-specific Skill Sets';
  if (rank <= 59) return 'Wyrd Powers';
  if (rank <= 69) return 'Cult Wyrd Powers';
  if (rank <= 79) return 'Psychoteric Whispers';
  if (rank <= 89) return 'Legendary Names';
  if (rank <= 99) return 'Ironhead Squat Mining Clans';
  return 'Misc.';
}
