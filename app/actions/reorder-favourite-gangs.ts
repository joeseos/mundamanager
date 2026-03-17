'use server'

import { createClient } from "@/utils/supabase/server";
import { revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';

interface ReorderFavouriteGangsParams {
  gang_ids: string[];
}

interface ReorderFavouriteGangsResult {
  success: boolean;
  error?: string;
}

export async function reorderFavouriteGangs(
  params: ReorderFavouriteGangsParams
): Promise<ReorderFavouriteGangsResult> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: gangs, error: gangsError } = await supabase
      .from('gangs')
      .select('id, user_id')
      .in('id', params.gang_ids);

    if (gangsError || !gangs) {
      return { success: false, error: 'Failed to fetch gangs' };
    }

    const allOwned = gangs.every(g => g.user_id === user.id);
    if (!allOwned) {
      return { success: false, error: 'You do not own all specified gangs' };
    }

    for (let i = 0; i < params.gang_ids.length; i++) {
      const { error: updateError } = await supabase
        .from('gangs')
        .update({ favourite_order: i })
        .eq('id', params.gang_ids[i]);

      if (updateError) {
        console.error(`Error updating favourite_order for gang ${params.gang_ids[i]}:`, updateError);
        return { success: false, error: updateError.message };
      }
    }

    revalidateTag(CACHE_TAGS.USER_GANGS(user.id));
    revalidateTag(CACHE_TAGS.USER_DASHBOARD(user.id));

    return { success: true };
  } catch (error) {
    console.error('Error reordering favourite gangs:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
