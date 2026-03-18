'use server'

import { createClient } from "@/utils/supabase/server";
import { revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';

type FavouriteType = 'gang' | 'campaign';

interface ReorderFavouritesParams {
  type: FavouriteType;
  ids: string[];
}

interface ReorderFavouritesResult {
  success: boolean;
  error?: string;
}

const CONFIG: Record<FavouriteType, {
  table: string;
  entityLabel: string;
  cacheTag: (userId: string) => string;
}> = {
  gang: {
    table: 'gangs',
    entityLabel: 'gangs',
    cacheTag: CACHE_TAGS.USER_GANGS,
  },
  campaign: {
    table: 'campaign_members',
    entityLabel: 'campaign memberships',
    cacheTag: CACHE_TAGS.USER_CAMPAIGNS,
  },
};

export async function reorderFavourites(
  params: ReorderFavouritesParams
): Promise<ReorderFavouritesResult> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);
    const { table, entityLabel, cacheTag } = CONFIG[params.type];

    const { data: rows, error: fetchError } = await supabase
      .from(table)
      .select('id, user_id')
      .in('id', params.ids);

    if (fetchError || !rows) {
      return { success: false, error: `Failed to fetch ${entityLabel}` };
    }

    const allOwned = rows.every(r => r.user_id === user.id);
    if (!allOwned) {
      return { success: false, error: `You do not own all specified ${entityLabel}` };
    }

    for (let i = 0; i < params.ids.length; i++) {
      const { error: updateError } = await supabase
        .from(table)
        .update({ favourite_order: i })
        .eq('id', params.ids[i]);

      if (updateError) {
        console.error(`Error updating favourite_order for ${table} ${params.ids[i]}:`, updateError);
        return { success: false, error: updateError.message };
      }
    }

    revalidateTag(cacheTag(user.id));

    return { success: true };
  } catch (error) {
    console.error(`Error reordering favourite ${entityLabel}:`, error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
