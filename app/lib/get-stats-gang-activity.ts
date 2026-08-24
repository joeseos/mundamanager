import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';

import { getGangCountsByEdition } from '@/app/lib/get-stats-by-edition';
import { ActivityStatsWithEdition } from '@/types/stats';

export type { ActivityStatsWithEdition as GangActivityStats };

/**
 * Get cached gang activity counts by last_updated for admin display,
 * split by edition (N23 / N26).
 *
 * Revalidation strategies:
 * - Automatic: Every 86400 seconds (24 hours)
 * - Manual: Call revalidateTag(TAGS.globalGangActivity(), { expire: 0 }) as needed
 *
 * @returns Counts per period with edition breakdown, or null if service role key is not available
 */
const getCachedGangActivityStats = unstable_cache(
  async () => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return null;
    }

    const cutoffFor = (days: number) =>
      new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [last2Weeks, last1Month, last3Months, last6Months] = await Promise.all([
      getGangCountsByEdition(cutoffFor(14)),
      getGangCountsByEdition(cutoffFor(30)),
      getGangCountsByEdition(cutoffFor(90)),
      getGangCountsByEdition(cutoffFor(180)),
    ]);

    return { last2Weeks, last1Month, last3Months, last6Months };
  },
  ['global-gang-activity'],
  {
    tags: [TAGS.globalGangActivity()],
    revalidate: 86400,
  }
);

export async function getGangActivityStats(): Promise<ActivityStatsWithEdition | null> {
  return getCachedGangActivityStats();
}
