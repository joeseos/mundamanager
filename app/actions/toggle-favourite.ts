'use server'

import { createClient } from "@/utils/supabase/server";
import { revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';

type FavouriteType = 'gang' | 'campaign';

interface ToggleFavouriteParams {
  type: FavouriteType;
  id: string;
  is_favourite: boolean;
}

interface ToggleFavouriteResult {
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
    entityLabel: 'Gang',
    cacheTag: CACHE_TAGS.USER_GANGS,
  },
  campaign: {
    table: 'campaign_members',
    entityLabel: 'Campaign membership',
    cacheTag: CACHE_TAGS.USER_CAMPAIGNS,
  },
};

export async function toggleFavourite(
  params: ToggleFavouriteParams
): Promise<ToggleFavouriteResult> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);
    const { table, entityLabel, cacheTag } = CONFIG[params.type];

    const { data: row, error: fetchError } = await supabase
      .from(table)
      .select('id, user_id')
      .eq('id', params.id)
      .single();

    if (fetchError || !row) {
      return { success: false, error: `${entityLabel} not found` };
    }

    if (row.user_id !== user.id) {
      return { success: false, error: `You do not own this ${entityLabel.toLowerCase()}` };
    }

    if (params.is_favourite) {
      const { data: maxRow } = await supabase
        .from(table)
        .select('favourite_order')
        .eq('user_id', user.id)
        .eq('is_favourite', true)
        .order('favourite_order', { ascending: false, nullsFirst: false })
        .limit(1)
        .single();

      const nextOrder = (maxRow?.favourite_order ?? -1) + 1;

      const { error: updateError } = await supabase
        .from(table)
        .update({ is_favourite: true, favourite_order: nextOrder })
        .eq('id', params.id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }
    } else {
      const { error: updateError } = await supabase
        .from(table)
        .update({ is_favourite: false, favourite_order: null })
        .eq('id', params.id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }
    }

    revalidateTag(cacheTag(user.id));

    return { success: true };
  } catch (error) {
    console.error(`Error toggling ${params.type} favourite:`, error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
