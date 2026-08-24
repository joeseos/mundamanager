import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';

import { getCampaignCountsByEdition } from '@/app/lib/get-stats-by-edition';
import { ActivityStatsWithEdition } from '@/types/stats';

export type { ActivityStatsWithEdition as CampaignActivityStats };

/**
 * Get cached campaign activity counts by updated_at for admin display,
 * split by edition (N23 / N26).
 *
 * Revalidation strategies:
 * - Automatic: Every 86400 seconds (24 hours)
 * - Manual: Call revalidateTag(TAGS.globalCampaignActivity(), { expire: 0 }) as needed
 *
 * @returns Counts per period with edition breakdown, or null if service role key is not available
 */
const getCachedCampaignActivityStats = unstable_cache(
  async () => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return null;
    }

    const cutoffFor = (days: number) =>
      new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [last2Weeks, last1Month, last3Months, last6Months] = await Promise.all([
      getCampaignCountsByEdition(cutoffFor(14)),
      getCampaignCountsByEdition(cutoffFor(30)),
      getCampaignCountsByEdition(cutoffFor(90)),
      getCampaignCountsByEdition(cutoffFor(180)),
    ]);

    return { last2Weeks, last1Month, last3Months, last6Months };
  },
  ['global-campaign-activity'],
  {
    tags: [TAGS.globalCampaignActivity()],
    revalidate: 86400,
  }
);

export async function getCampaignActivityStats(): Promise<ActivityStatsWithEdition | null> {
  return getCachedCampaignActivityStats();
}
