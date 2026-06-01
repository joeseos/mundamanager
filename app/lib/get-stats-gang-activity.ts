import { createServiceRoleClient } from '@/utils/supabase/server';

export interface GangActivityStats {
  last2Weeks: number | null;
  last1Month: number | null;
  last3Months: number | null;
  last6Months: number | null;
}

const PERIODS = {
  last2Weeks: 14,
  last1Month: 30,
  last3Months: 90,
  last6Months: 180,
} as const;

async function countGangsUpdatedSince(days: number): Promise<number | null> {
  const supabase = createServiceRoleClient();
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
}

/**
 * Get gang activity counts by last_updated for admin display.
 *
 * @returns Counts per period, or null if service role key is not available
 */
export async function getGangActivityStats(): Promise<GangActivityStats | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const [last2Weeks, last1Month, last3Months, last6Months] = await Promise.all([
    countGangsUpdatedSince(PERIODS.last2Weeks),
    countGangsUpdatedSince(PERIODS.last1Month),
    countGangsUpdatedSince(PERIODS.last3Months),
    countGangsUpdatedSince(PERIODS.last6Months),
  ]);

  return { last2Weeks, last1Month, last3Months, last6Months };
}
