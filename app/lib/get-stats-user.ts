import { createClient } from '@supabase/supabase-js';
import { cacheTag, cacheLife } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';

/**
 * Get cached user count for public display.
 *
 * Revalidation strategies:
 * - Automatic: cacheLife('days') (24 hours)
 * - Manual: Call revalidateTag(CACHE_TAGS.GLOBAL_USER_COUNT(), { expire: 0 }) after user registration
 *
 * @returns The total number of users in the database
 */
export async function getUserCount(): Promise<number> {
  'use cache: remote';
  cacheLife('days');
  cacheTag(CACHE_TAGS.GLOBAL_USER_COUNT());

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
}
