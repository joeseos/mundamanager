import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { createServiceRoleClient } from '@/utils/supabase/server';
import { withEditionSlug } from '@/types/edition';
import { compareTacticsCards, type TacticsCard } from '@/types/tactics-card';

/**
 * The tactics_cards catalogue for one edition. Service role because every user
 * of that edition reads the same rows. Revalidation is time-based for the same
 * reason as editions: nothing in the app can call revalidateTag on it.
 */
const getCachedTacticsCards = unstable_cache(
  async (editionId: string): Promise<TacticsCard[]> => {
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('tactics_cards')
      .select('id, name, d66_min, d66_max, editions:edition_id ( slug )')
      .eq('edition_id', editionId);

    if (error) {
      console.error('Error fetching tactics cards:', error);
      throw new Error(`Failed to fetch tactics cards: ${error.message}`);
    }

    return (data ?? [])
      .map(withEditionSlug)
      .sort(compareTacticsCards) as TacticsCard[];
  },
  ['global-tactics-cards'],
  {
    tags: [CACHE_TAGS.GLOBAL_TACTICS_CARDS()],
    revalidate: 3600, // 1 hour — the catalogue only changes via migration
  }
);

export async function getTacticsCards(editionId: string): Promise<TacticsCard[]> {
  return getCachedTacticsCards(editionId);
}
