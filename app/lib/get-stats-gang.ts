import { getGangCountsByEdition } from '@/app/lib/get-stats-by-edition';

/**
 * Get cached gang count for public display.
 *
 * Shares the by-edition totals cache (24h, invalidated via TAGS.globalGangCount()).
 *
 * @returns The total number of gangs in the database, or null if unavailable
 */
export async function getGangCount(): Promise<number | null> {
  return (await getGangCountsByEdition())?.total ?? null;
}
