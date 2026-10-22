import { getCampaignCountsByEdition } from '@/app/lib/get-stats-by-edition';

/**
 * Get cached campaign count for public display.
 *
 * Shares the by-edition totals cache (24h, invalidated via TAGS.globalCampaignCount()).
 *
 * @returns The total number of campaigns in the database
 */
export async function getCampaignCount(): Promise<number> {
  return (await getCampaignCountsByEdition()).total;
}
