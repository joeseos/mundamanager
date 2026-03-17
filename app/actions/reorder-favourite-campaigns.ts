'use server'

import { createClient } from "@/utils/supabase/server";
import { revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';

interface ReorderFavouriteCampaignsParams {
  campaign_member_ids: string[];
}

interface ReorderFavouriteCampaignsResult {
  success: boolean;
  error?: string;
}

export async function reorderFavouriteCampaigns(
  params: ReorderFavouriteCampaignsParams
): Promise<ReorderFavouriteCampaignsResult> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: members, error: membersError } = await supabase
      .from('campaign_members')
      .select('id, user_id')
      .in('id', params.campaign_member_ids);

    if (membersError || !members) {
      return { success: false, error: 'Failed to fetch campaign memberships' };
    }

    const allOwned = members.every(m => m.user_id === user.id);
    if (!allOwned) {
      return { success: false, error: 'You do not own all specified campaign memberships' };
    }

    for (let i = 0; i < params.campaign_member_ids.length; i++) {
      const { error: updateError } = await supabase
        .from('campaign_members')
        .update({ favourite_order: i })
        .eq('id', params.campaign_member_ids[i]);

      if (updateError) {
        console.error(`Error updating favourite_order for campaign_member ${params.campaign_member_ids[i]}:`, updateError);
        return { success: false, error: updateError.message };
      }
    }

    revalidateTag(CACHE_TAGS.USER_CAMPAIGNS(user.id));
    revalidateTag(CACHE_TAGS.USER_DASHBOARD(user.id));

    return { success: true };
  } catch (error) {
    console.error('Error reordering favourite campaigns:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
