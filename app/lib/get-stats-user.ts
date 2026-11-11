import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { getAppDb } from '@/utils/db/client';
import { profiles } from '@/utils/db/schema';

/**
 * Get cached user count for public display.
 *
 * Revalidation strategies:
 * - Automatic: Every 86400 seconds (24 hours)
 * - Manual: Call revalidateTag(TAGS.globalUserCount(), { expire: 0 }) after user registration
 *
 * @returns The total number of users in the database
 */
const getCachedUserCount = unstable_cache(
  async () => getAppDb().$count(profiles),
  ['global-user-count'],
  {
    tags: [TAGS.globalUserCount()],
    revalidate: 86400,
  }
);

export async function getUserCount(): Promise<number> {
  return getCachedUserCount();
}
