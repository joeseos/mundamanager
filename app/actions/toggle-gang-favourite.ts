'use server'

import { createClient } from "@/utils/supabase/server";
import { revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';

interface ToggleGangFavouriteParams {
  gang_id: string;
  is_favourite: boolean;
}

interface ToggleGangFavouriteResult {
  success: boolean;
  error?: string;
}

export async function toggleGangFavourite(
  params: ToggleGangFavouriteParams
): Promise<ToggleGangFavouriteResult> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('id, user_id')
      .eq('id', params.gang_id)
      .single();

    if (gangError || !gang) {
      return { success: false, error: 'Gang not found' };
    }

    if (gang.user_id !== user.id) {
      return { success: false, error: 'You do not own this gang' };
    }

    if (params.is_favourite) {
      const { data: maxRow } = await supabase
        .from('gangs')
        .select('favourite_order')
        .eq('user_id', user.id)
        .eq('is_favourite', true)
        .order('favourite_order', { ascending: false, nullsFirst: false })
        .limit(1)
        .single();

      const nextOrder = (maxRow?.favourite_order ?? -1) + 1;

      const { error: updateError } = await supabase
        .from('gangs')
        .update({ is_favourite: true, favourite_order: nextOrder })
        .eq('id', params.gang_id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }
    } else {
      const { error: updateError } = await supabase
        .from('gangs')
        .update({ is_favourite: false, favourite_order: null })
        .eq('id', params.gang_id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }
    }

    revalidateTag(CACHE_TAGS.USER_GANGS(user.id));
    revalidateTag(CACHE_TAGS.USER_DASHBOARD(user.id));

    return { success: true };
  } catch (error) {
    console.error('Error toggling gang favourite:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
