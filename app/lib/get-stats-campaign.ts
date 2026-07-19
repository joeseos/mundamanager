import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';

import { createServiceRoleClient } from '@/utils/supabase/server';

/**
 * Get cached campaign count for public display.
 *
 * Revalidation strategies:
 * - Automatic: Every 86400 seconds (24 hours)
 * - Manual: Call revalidateTag(TAGS.globalCampaignCount(), { expire: 0 }) after campaign creation/deletion
 *
 * @returns The total number of campaigns in the database, or null if service role key is not available
 */
const getCachedCampaignCount = unstable_cache(
  async () => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return null;
    }

    const supabase = createServiceRoleClient();

    const { count, error } = await supabase
      .from('campaigns')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('Error fetching campaign count:', error);
      return null;
    }

    return count || 0;
  },
  ['global-campaign-count'],
  {
    tags: [TAGS.globalCampaignCount()],
    revalidate: 86400,
  }
);

export async function getCampaignCount(): Promise<number | null> {
  return getCachedCampaignCount();
}
