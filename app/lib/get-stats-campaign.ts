import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { createServiceRoleClient } from '@/utils/supabase/server';

/**
 * Get cached campaign count for public display
 * 
 * This function uses unstable_cache to avoid hitting the database on every request.
 * The count is cached and revalidated every 24 hours (86400 seconds).
 * 
 * Revalidation strategies:
 * - Automatic: Every 86400 seconds (24 hours)
 * - Manual: Call revalidateTag(CACHE_TAGS.GLOBAL_CAMPAIGN_COUNT()) after campaign creation/deletion
 * 
 * @returns The total number of campaigns in the database, or null if service role key is not available
 */
export async function getCampaignCount(): Promise<number | null> {
  const getCachedCampaignCount = unstable_cache(
    async () => {
      // Check if service role key is available
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return null;
      }

      // Use service role key to bypass RLS for public stats
      const supabase = createServiceRoleClient();
      
      // Count all campaigns
      const { count, error } = await supabase
        .from('campaigns')
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        console.error('Error fetching campaign count:', error);
        return null;
      }
      
      return count || 0;
    },
    ['global-campaign-count'], // Cache key
    {
      tags: [CACHE_TAGS.GLOBAL_CAMPAIGN_COUNT()],
      revalidate: 86400, // Revalidate every 24 hours (86400 seconds)
    }
  );

  return await getCachedCampaignCount();
}

