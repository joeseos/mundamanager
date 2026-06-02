import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';

/**
 * Get cached user count for public display.
 *
 * Revalidation strategies:
 * - Automatic: Every 86400 seconds (24 hours)
 * - Manual: Call revalidateTag(CACHE_TAGS.GLOBAL_USER_COUNT()) after user registration
 *
 * @returns The total number of users in the database
 */
const getCachedUserCount = unstable_cache(
  async () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { count, error } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('Error fetching user count:', error);
      return 0;
    }

    return count || 0;
  },
  ['global-user-count'],
  {
    tags: [CACHE_TAGS.GLOBAL_USER_COUNT()],
    revalidate: 86400,
  }
);

export async function getUserCount(): Promise<number> {
  return await getCachedUserCount();
}
