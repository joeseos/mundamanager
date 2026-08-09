import type { EditionSlug } from '@/types/edition';
import { fighterSubtypeRankN23 } from '@/utils/fighterSubtypeRankN23';
import { fighterSubtypeRankN26 } from '@/utils/fighterSubtypeRankN26';

export { fighterSubtypeRankN23 } from '@/utils/fighterSubtypeRankN23';
export { fighterSubtypeRankN26 } from '@/utils/fighterSubtypeRankN26';

/**
 * Keyed by EditionSlug so a new edition is a compile error here until it states
 * its own order, matching LIMITS_BY_EDITION and SKILL_SET_RANK_BY_EDITION.
 */
const FIGHTER_SUBTYPE_RANK_BY_EDITION: Record<EditionSlug, { [key: string]: number }> = {
  n23: fighterSubtypeRankN23,
  n26: fighterSubtypeRankN26,
};

/**
 * Edition-scoped fighter-subtype sort order. An unset or unrecognised slug
 * gets no ranking, so callers fall back rather than borrowing another
 * edition's order.
 */
export function getFighterSubtypeRank(
  editionSlug?: string | null
): { [key: string]: number } {
  if (!editionSlug) return {};
  return FIGHTER_SUBTYPE_RANK_BY_EDITION[editionSlug as EditionSlug] ?? {};
}

/**
 * Sort rank for a fighter across all its subtype labels. Uses the best
 * (lowest) recognised rank so labels like "Pious" or "Beast" do not hide
 * "Prospect" / "Pet" when those are not first in the array.
 */
export function getFighterSubtypeSortRank(
  subtypes: string[] | null | undefined,
  editionSlug?: string | null
): number {
  const ranks = getFighterSubtypeRank(editionSlug);
  let best = Infinity;
  for (const subtype of subtypes ?? []) {
    const rank = ranks[subtype.toLowerCase().trim()];
    if (rank !== undefined && rank < best) {
      best = rank;
    }
  }
  return best;
}
