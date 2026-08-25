import { TAGS } from '@/utils/cache-tags';

import { getCampaignCountsByEdition } from '@/app/lib/get-stats-by-edition';
import { makeActivityStats } from '@/app/lib/get-stats-activity';
import type { ActivityStats } from '@/types/stats';

export type { ActivityStats as CampaignActivityStats };

/**
 * Get cached campaign activity counts by updated_at for admin display,
 * split by edition.
 *
 * Revalidation strategies:
 * - Automatic: Every 86400 seconds (24 hours)
 * - Manual: Call revalidateTag(TAGS.globalCampaignActivity(), { expire: 0 }) as needed
 */
const getCachedCampaignActivityStats = makeActivityStats(
  getCampaignCountsByEdition,
  'global-campaign-activity',
  TAGS.globalCampaignActivity()
);

export async function getCampaignActivityStats(): Promise<ActivityStats | null> {
  return getCachedCampaignActivityStats();
}
