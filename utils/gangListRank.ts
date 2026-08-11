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

// Once per unrecognised slug, not once per lookup — matches answerFor in types/edition.
const warnedSlugs = new Set<string>();

/**
 * Edition-scoped gang-type sort and group order. An unset slug gets no ranking
 * (quiet — edition never resolved). An unrecognised slug also gets no ranking
 * rather than borrowing another edition's order, but warns once in development
 * so missing GANG_LIST_RANK_BY_EDITION rows surface instead of silently grouping
 * everything under Misc.
 */
export function getGangListRank(
  editionSlug?: string | null
): { [key: string]: number } {
  if (!editionSlug) return {};

  const ranks = GANG_LIST_RANK_BY_EDITION[editionSlug as EditionSlug];
  if (ranks) return ranks;

  if (process.env.NODE_ENV !== 'production' && !warnedSlugs.has(editionSlug)) {
    warnedSlugs.add(editionSlug);
    console.warn(
      `[gangListRank] Unknown edition slug "${editionSlug}" — add it to ` +
      `EditionSlug and GANG_LIST_RANK_BY_EDITION. Until then gang types are ` +
      `unsorted / grouped under Misc.`
    );
  }
  return {};
}
