'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidatePath, revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';

export interface CustomTradingPostData {
  custom_trading_post_name: string;
  description?: string | null;
}

export interface CustomTradingPost {
  id: string;
  user_id: string;
  custom_trading_post_name: string;
  description?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export async function createCustomTradingPost(
  data: CustomTradingPostData
): Promise<{ success: boolean; data?: CustomTradingPost; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: newTradingPost, error: insertError } = await supabase
      .from('custom_trading_posts')
      .insert({
        user_id: user.id,
        custom_trading_post_name: data.custom_trading_post_name.trimEnd(),
        description: data.description || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating custom trading post:', insertError);
      return { success: false, error: `Failed to create custom trading post: ${insertError.message}` };
    }

    revalidatePath('/');
    return { success: true, data: newTradingPost };
  } catch (error) {
    console.error('Error in createCustomTradingPost:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function updateCustomTradingPost(
  id: string,
  data: CustomTradingPostData
): Promise<{ success: boolean; data?: CustomTradingPost; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: existing, error: fetchError } = await supabase
      .from('custom_trading_posts')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: 'Custom trading post not found or not owned by user' };
    }

    const { data: updated, error: updateError } = await supabase
      .from('custom_trading_posts')
      .update({
        custom_trading_post_name: data.custom_trading_post_name.trimEnd(),
        description: data.description || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating custom trading post:', updateError);
      return { success: false, error: `Failed to update custom trading post: ${updateError.message}` };
    }

    revalidatePath('/');
    return { success: true, data: updated };
  } catch (error) {
    console.error('Error in updateCustomTradingPost:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

export async function deleteCustomTradingPost(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: existing, error: fetchError } = await supabase
      .from('custom_trading_posts')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: 'Custom trading post not found or not owned by user' };
    }

    const { data: sharedCampaigns } = await supabase
      .from('custom_shared')
      .select('campaign_id')
      .eq('custom_trading_post_id', id);

    const affectedCampaignIds = (sharedCampaigns || []).map(s => s.campaign_id);

    if (affectedCampaignIds.length > 0) {
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select('id, custom_trading_posts')
        .in('id', affectedCampaignIds);

      for (const campaign of campaigns || []) {
        const currentPosts = (campaign.custom_trading_posts as string[]) || [];
        if (currentPosts.includes(id)) {
          const updated = currentPosts.filter((postId: string) => postId !== id);
          await supabase
            .from('campaigns')
            .update({ custom_trading_posts: updated })
            .eq('id', campaign.id);
          revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_BASIC(campaign.id));
        }
      }
    }

    const { error: deleteError } = await supabase
      .from('custom_trading_posts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting custom trading post:', deleteError);
      return { success: false, error: `Failed to delete custom trading post: ${deleteError.message}` };
    }

    revalidatePath('/');
    return { success: true };
  } catch (error) {
    console.error('Error in deleteCustomTradingPost:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}
