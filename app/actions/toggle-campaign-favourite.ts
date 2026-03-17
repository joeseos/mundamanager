'use server'

import { createClient } from "@/utils/supabase/server";
import { revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';

interface ToggleCampaignFavouriteParams {
  campaign_member_id: string;
  is_favourite: boolean;
}

interface ToggleCampaignFavouriteResult {
  success: boolean;
  error?: string;
}

export async function toggleCampaignFavourite(
  params: ToggleCampaignFavouriteParams
): Promise<ToggleCampaignFavouriteResult> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: member, error: memberError } = await supabase
      .from('campaign_members')
      .select('id, user_id')
      .eq('id', params.campaign_member_id)
      .single();

    if (memberError || !member) {
      return { success: false, error: 'Campaign membership not found' };
    }

    if (member.user_id !== user.id) {
      return { success: false, error: 'You do not own this campaign membership' };
    }

    if (params.is_favourite) {
      const { data: maxRow } = await supabase
        .from('campaign_members')
        .select('favourite_order')
        .eq('user_id', user.id)
        .eq('is_favourite', true)
        .order('favourite_order', { ascending: false, nullsFirst: false })
        .limit(1)
        .single();

      const nextOrder = (maxRow?.favourite_order ?? -1) + 1;

      const { error: updateError } = await supabase
        .from('campaign_members')
        .update({ is_favourite: true, favourite_order: nextOrder })
        .eq('id', params.campaign_member_id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }
    } else {
      const { error: updateError } = await supabase
        .from('campaign_members')
        .update({ is_favourite: false, favourite_order: null })
        .eq('id', params.campaign_member_id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }
    }

    revalidateTag(CACHE_TAGS.USER_CAMPAIGNS(user.id));
    revalidateTag(CACHE_TAGS.USER_DASHBOARD(user.id));

    return { success: true };
  } catch (error) {
    console.error('Error toggling campaign favourite:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
