import { unstable_cache } from 'next/cache';

import type { ActivityStats, EditionCounts } from '@/types/stats';

const ACTIVITY_WINDOWS_DAYS = [14, 30, 90, 180] as const;

/**
 * Shared 24h-cached activity windows for admin stats.
 * Each period is loaded via the provided by-edition fetcher.
 */
export function makeActivityStats(
  fetcher: (since: string) => Promise<EditionCounts | null>,
  cacheKey: string,
  tag: string
): () => Promise<ActivityStats | null> {
  const getCached = unstable_cache(
    async () => {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return null;
      }

      const cutoffFor = (days: number) =>
        new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const [last2Weeks, last1Month, last3Months, last6Months] =
        await Promise.all(
          ACTIVITY_WINDOWS_DAYS.map((days) => fetcher(cutoffFor(days)))
        );

      return { last2Weeks, last1Month, last3Months, last6Months };
    },
    [cacheKey],
    {
      tags: [tag],
      revalidate: 86400,
    }
  );

  return getCached;
}
