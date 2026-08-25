import { TAGS } from '@/utils/cache-tags';

import { getGangCountsByEdition } from '@/app/lib/get-stats-by-edition';
import { makeActivityStats } from '@/app/lib/get-stats-activity';
import type { ActivityStats } from '@/types/stats';

export type { ActivityStats as GangActivityStats };

/**
 * Get cached gang activity counts by last_updated for admin display,
 * split by edition.
 *
 * Revalidation strategies:
 * - Automatic: Every 86400 seconds (24 hours)
 * - Manual: Call revalidateTag(TAGS.globalGangActivity(), { expire: 0 }) as needed
 */
const getCachedGangActivityStats = makeActivityStats(
  getGangCountsByEdition,
  'global-gang-activity',
  TAGS.globalGangActivity()
);

export async function getGangActivityStats(): Promise<ActivityStats | null> {
  return getCachedGangActivityStats();
}
