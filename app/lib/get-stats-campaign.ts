import { cacheTag, cacheLife } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { createServiceRoleClient } from '@/utils/supabase/server';

/**
 * Get cached campaign count for public display.
 *
 * Revalidation strategies:
 * - Automatic: cacheLife('days') (24 hours)
 * - Manual: Call revalidateTag(CACHE_TAGS.GLOBAL_CAMPAIGN_COUNT(), { expire: 0 }) after campaign creation/deletion
 *
 * @returns The total number of campaigns in the database, or null if service role key is not available
 */
export async function getCampaignCount(): Promise<number | null> {
  'use cache: remote';
  cacheLife('days');
  cacheTag(CACHE_TAGS.GLOBAL_CAMPAIGN_COUNT());

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
}
