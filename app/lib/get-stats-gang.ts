import { cacheTag, cacheLife } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { createServiceRoleClient } from '@/utils/supabase/server';

/**
 * Get cached gang count for public display.
 *
 * Revalidation strategies:
 * - Automatic: cacheLife('days') (24 hours)
 * - Manual: Call revalidateTag(CACHE_TAGS.GLOBAL_GANG_COUNT(), { expire: 0 }) after gang creation/deletion
 *
 * @returns The total number of gangs in the database, or null if service role key is not available
 */
export async function getGangCount(): Promise<number | null> {
  'use cache: remote';
  cacheLife('days');
  cacheTag(CACHE_TAGS.GLOBAL_GANG_COUNT());

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const supabase = createServiceRoleClient();

  const { count, error } = await supabase
    .from('gangs')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error fetching gang count:', error);
    return null;
  }

  return count || 0;
}
