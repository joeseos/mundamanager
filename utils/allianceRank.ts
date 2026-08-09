import type { EditionSlug } from '@/types/edition';
import { allianceRankN23 } from '@/utils/allianceRankN23';
import { allianceRankN26 } from '@/utils/allianceRankN26';

export { allianceRankN23 } from '@/utils/allianceRankN23';
export { allianceRankN26 } from '@/utils/allianceRankN26';

/**
 * Keyed by EditionSlug so a new edition is a compile error here until it states
 * its own order, matching LIMITS_BY_EDITION and SKILL_SET_RANK_BY_EDITION.
 */
const ALLIANCE_RANK_BY_EDITION: Record<EditionSlug, { [key: string]: number }> = {
  n23: allianceRankN23,
  n26: allianceRankN26,
};

/**
 * Edition-scoped alliance sort order. An unset or unrecognised slug gets no
 * ranking, so callers fall back rather than borrowing another edition's order.
 */
export function getAllianceRank(
  editionSlug?: string | null
): { [key: string]: number } {
  if (!editionSlug) return {};
  return ALLIANCE_RANK_BY_EDITION[editionSlug as EditionSlug] ?? {};
}
