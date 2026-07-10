import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';

import { createServiceRoleClient } from '@/utils/supabase/server';
import { ActivityStats } from '@/types/stats';

export type { ActivityStats as GangActivityStats };

/**
 * Get cached gang activity counts by last_updated for admin display.
 *
 * Revalidation strategies:
 * - Automatic: Every 86400 seconds (24 hours)
 * - Manual: Call revalidateTag(TAGS.globalGangActivity(), { expire: 0 }) as needed
 *
 * @returns Counts per period, or null if service role key is not available
 */
const getCachedGangActivityStats = unstable_cache(
  async () => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return null;
    }

    const supabase = createServiceRoleClient();

    const countSince = async (days: number): Promise<number | null> => {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from('gangs')
        .select('*', { count: 'exact', head: true })
        .gte('last_updated', cutoff);

      if (error) {
        console.error('Error fetching gang activity count:', error);
        return null;
      }

      return count ?? 0;
    };

    const [last2Weeks, last1Month, last3Months, last6Months] = await Promise.all([
      countSince(14),
      countSince(30),
      countSince(90),
      countSince(180),
    ]);

    return { last2Weeks, last1Month, last3Months, last6Months };
  },
  ['global-gang-activity'],
  {
    tags: [TAGS.globalGangActivity()],
    revalidate: 86400,
  }
);

export async function getGangActivityStats(): Promise<ActivityStats | null> {
  return getCachedGangActivityStats();
}
