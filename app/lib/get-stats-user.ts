import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';

/**
 * Get cached user count for public display
 * 
 * This function uses unstable_cache to avoid hitting the database on every request.
 * The count is cached and revalidated every 24 hours (86400 seconds).
 * 
 * Revalidation strategies:
 * - Automatic: Every 86400 seconds (24 hours)
 * - Manual: Call revalidateTag(CACHE_TAGS.GLOBAL_USER_COUNT()) after user registration
 * 
 * @returns The total number of users in the database
 */
export async function getUserCount(): Promise<number> {
  const getCachedUserCount = unstable_cache(
    async () => {
      // Use anon key for public data (RLS may control access, but count is typically public)
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      
      // Count all profiles (or users depending on your schema)
      const { count, error } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        console.error('Error fetching user count:', error);
        // Return a fallback count or throw based on your preference
        return 0;
      }
      
      return count || 0;
    },
    ['global-user-count'], // Cache key
    {
      tags: [CACHE_TAGS.GLOBAL_USER_COUNT()],
      revalidate: 86400, // Revalidate every 24 hours (86400 seconds)
    }
  );

  return await getCachedUserCount();
}

