import { cacheTag, cacheLife } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { createServiceRoleClient } from '@/utils/supabase/server';

/**
 * Get gang fighters with persistent caching
 * Invalidation: Server actions only via revalidateTag()
 */
export const getGangFighters = async (gangId: string) => {
  'use cache: remote';
  cacheLife('max');
  cacheTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(gangId));

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from('fighters')
    .select('id, fighter_name, fighter_type, xp, killed, retired, enslaved, starved, recovery, captured')
    .eq('gang_id', gangId);
  if (error) throw error;
  return data;
};
