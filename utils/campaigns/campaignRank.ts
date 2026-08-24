import type { EditionSlug } from '@/types/edition';
import { campaignRankN23 } from '@/utils/campaigns/campaignRankN23';
import { campaignRankN26 } from '@/utils/campaigns/campaignRankN26';

/**
 * Keyed by EditionSlug so a new edition is a compile error here until it states
 * its own order, matching getAllianceRank / ALLIANCE_RANK_BY_EDITION.
 */
const CAMPAIGN_RANK_BY_EDITION: Record<EditionSlug, { [key: string]: number }> = {
  n23: campaignRankN23,
  n26: campaignRankN26,
};

/**
 * Edition-scoped campaign-type sort order. An unset or unrecognised slug gets no
 * ranking, so callers fall back rather than borrowing another edition's order.
 */
export function getCampaignRank(
  editionSlug?: string | null
): { [key: string]: number } {
  if (!editionSlug) return {};
  return CAMPAIGN_RANK_BY_EDITION[editionSlug as EditionSlug] ?? {};
}
