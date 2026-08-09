import type { EditionSlug } from '@/types/edition';
import { gangAdditionRankN23 } from '@/utils/gangAdditionRankN23';
import { gangAdditionRankN26 } from '@/utils/gangAdditionRankN26';

export { gangAdditionRankN23 } from '@/utils/gangAdditionRankN23';
export { gangAdditionRankN26 } from '@/utils/gangAdditionRankN26';

/**
 * Keyed by EditionSlug so a new edition is a compile error here until it states
 * its own order, matching LIMITS_BY_EDITION and SKILL_SET_RANK_BY_EDITION.
 */
const GANG_ADDITION_RANK_BY_EDITION: Record<EditionSlug, { [key: string]: number }> = {
  n23: gangAdditionRankN23,
  n26: gangAdditionRankN26,
};

/**
 * Edition-scoped gang-addition subtype / alliance-crew sort order. An unset or
 * unrecognised slug gets no ranking, so callers fall back to Misc. rather than
 * borrowing another edition's order.
 */
export function getGangAdditionRank(
  editionSlug?: string | null
): { [key: string]: number } {
  if (!editionSlug) return {};
  return GANG_ADDITION_RANK_BY_EDITION[editionSlug as EditionSlug] ?? {};
}

/**
 * Best (lowest) recognised gang-addition rank across all subtype labels.
 */
export function getGangAdditionSortRank(
  subtypes: string[] | null | undefined,
  editionSlug?: string | null
): number {
  const ranks = getGangAdditionRank(editionSlug);
  let best = Infinity;
  for (const subtype of subtypes ?? []) {
    const rank = ranks[subtype.toLowerCase().trim()];
    if (rank !== undefined && rank < best) {
      best = rank;
    }
  }
  return best;
}
