import type { EditionSlug } from '@/types/edition';
import { gangListRankN23 } from '@/utils/gangListRankN23';
import { gangListRankN26 } from '@/utils/gangListRankN26';

export { gangListRankN23 } from '@/utils/gangListRankN23';
export { gangListRankN26 } from '@/utils/gangListRankN26';

/**
 * Keyed by EditionSlug so a new edition is a compile error here until it states
 * its own order, matching LIMITS_BY_EDITION and SKILL_SET_RANK_BY_EDITION.
 */
const GANG_LIST_RANK_BY_EDITION: Record<EditionSlug, { [key: string]: number }> = {
  n23: gangListRankN23,
  n26: gangListRankN26,
};

/**
 * Edition-scoped gang-type sort and group order. An unset or unrecognised slug
 * gets no ranking, so callers fall back rather than borrowing another edition's
 * order — the same choice the sibling registries make.
 */
export function getGangListRank(
  editionSlug?: string | null
): { [key: string]: number } {
  if (!editionSlug) return {};
  return GANG_LIST_RANK_BY_EDITION[editionSlug as EditionSlug] ?? {};
}
