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
 * Edition-scoped skill-set sort and group order.
 *
 * Unlike the sibling registries, an unknown or unset slug falls back to N23
 * rather than to nothing. Those hold rules data, where borrowing another
 * edition's answer would mark stats illegal or roll the wrong injury; this only
 * decides how a dropdown is sorted and grouped. Returning nothing would collapse
 * every skill set into the single "Misc." bucket, which is worse than an order
 * that is merely from the wrong edition.
 */
export function getSkillSetRank(
  editionSlug?: string | null
): { [key: string]: number } {
  if (!editionSlug) return skillSetRankN23;
  return SKILL_SET_RANK_BY_EDITION[editionSlug as EditionSlug] ?? skillSetRankN23;
}
