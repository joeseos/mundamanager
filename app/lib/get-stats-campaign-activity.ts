import { createServiceRoleClient } from '@/utils/supabase/server';

export interface CampaignActivityStats {
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

async function countCampaignsUpdatedSince(days: number): Promise<number | null> {
  const supabase = createServiceRoleClient();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from('campaigns')
    .select('*', { count: 'exact', head: true })
    .gte('updated_at', cutoff);

  if (error) {
    console.error('Error fetching campaign activity count:', error);
    return null;
  }

  return count ?? 0;
}

/**
 * Get campaign activity counts by updated_at for admin display.
 *
 * @returns Counts per period, or null if service role key is not available
 */
export async function getCampaignActivityStats(): Promise<CampaignActivityStats | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const [last2Weeks, last1Month, last3Months, last6Months] = await Promise.all([
    countCampaignsUpdatedSince(PERIODS.last2Weeks),
    countCampaignsUpdatedSince(PERIODS.last1Month),
    countCampaignsUpdatedSince(PERIODS.last3Months),
    countCampaignsUpdatedSince(PERIODS.last6Months),
  ]);

  return { last2Weeks, last1Month, last3Months, last6Months };
}
