import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { createServiceRoleClient } from '@/utils/supabase/server';

export interface CampaignActivityStats {
  last2Weeks: number | null;
  last1Month: number | null;
  last3Months: number | null;
  last6Months: number | null;
}

/**
 * Get cached campaign activity counts by updated_at for admin display.
 *
 * Revalidation strategies:
 * - Automatic: Every 86400 seconds (24 hours)
 * - Manual: Call revalidateTag(CACHE_TAGS.GLOBAL_CAMPAIGN_ACTIVITY()) as needed
 *
 * @returns Counts per period, or null if service role key is not available
 */
export async function getCampaignActivityStats(): Promise<CampaignActivityStats | null> {
  const getCachedCampaignActivityStats = unstable_cache(
    async () => {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return null;
      }

      const supabase = createServiceRoleClient();

      const countSince = async (days: number): Promise<number | null> => {
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        const { count, error } = await supabase
          .from('campaigns')
          .select('*', { count: 'exact', head: true })
          .gte('updated_at', cutoff);

        if (error) {
          console.error('Error fetching campaign activity count:', error);
          return null;
        }

        return count ?? 0;
      };

      const [last2Weeks, last1Month, last3Months, last6Months] = await Promise.all([
        countSince(14),
        countSince(30),
        countSince(90),
        countSince(180),
      ]);

      return { last2Weeks, last1Month, last3Months, last6Months };
    },
    ['global-campaign-activity'],
    {
      tags: [CACHE_TAGS.GLOBAL_CAMPAIGN_ACTIVITY()],
      revalidate: 86400,
    }
  );

  return await getCachedCampaignActivityStats();
}
