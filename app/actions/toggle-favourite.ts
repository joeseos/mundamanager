'use server'

import { TAGS } from '@/utils/cache-tags';
import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { revalidateTag } from 'next/cache';

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
    cacheTag: TAGS.user,
  },
  campaign: {
    table: 'campaign_members',
    entityLabel: 'Campaign membership',
    cacheTag: TAGS.user,
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

    // campaign_members RLS only lets owners and arbitrators update rows, so a member's own
    // favourite columns are written with the service role, scoped to the caller's rows
    const writer = params.type === 'campaign' ? createServiceRoleClient() : supabase;

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

      const { error: updateError } = await writer
        .from(table)
        .update({ is_favourite: true, favourite_order: nextOrder })
        .eq('id', params.id)
        .eq('user_id', user.id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }
    } else {
      const { error: updateError } = await writer
        .from(table)
        .update({ is_favourite: false, favourite_order: null })
        .eq('id', params.id)
        .eq('user_id', user.id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }
    }

    revalidateTag(cacheTag(user.id), { expire: 0 });

    return { success: true };
  } catch (error) {
    console.error(`Error toggling ${params.type} favourite:`, error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
