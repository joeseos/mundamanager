import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';

// Internal helper functions
async function _getGangFighters(gangId: string, supabase: any) {
  const { data, error } = await supabase
    .from('fighters')
    .select('id, fighter_name, fighter_type, xp, killed, retired, enslaved, starved, recovery, captured')
    .eq('gang_id', gangId);
  if (error) throw error;
  return data;
}

/**
 * Get gang fighters with persistent caching
 * Cache key: gang-fighters-{gangId}
 * Invalidation: Server actions only via revalidateTag()
 */
export const getGangFighters = async (gangId: string, supabase: any) => {
  return unstable_cache(
    async () => {
      return _getGangFighters(gangId, supabase);
    },
    [`gang-fighters-${gangId}`],
    {
      tags: [CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(gangId)],
      revalidate: false
    }
  )();
};
