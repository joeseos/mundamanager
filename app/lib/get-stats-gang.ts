import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { createServiceRoleClient } from '@/utils/supabase/server';

/**
 * Get cached gang count for public display.
 *
 * Revalidation strategies:
 * - Automatic: Every 86400 seconds (24 hours)
 * - Manual: Call revalidateTag(CACHE_TAGS.GLOBAL_GANG_COUNT()) after gang creation/deletion
 *
 * @returns The total number of gangs in the database, or null if service role key is not available
 */
const getCachedGangCount = unstable_cache(
  async () => {
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
  },
  ['global-gang-count'],
  {
    tags: [CACHE_TAGS.GLOBAL_GANG_COUNT()],
    revalidate: 86400,
  }
);

export async function getGangCount(): Promise<number | null> {
  return await getCachedGangCount();
}
