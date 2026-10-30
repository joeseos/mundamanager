'use server';

import { invalidateCampaignCore, invalidateUser } from '@/utils/cache-tags';
import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { isUuid } from '@/utils/uuid';

export async function updateCampaignImage(
  campaignId: string,
  imageUrl?: string | null,
  campaignPortraitId?: string | null
) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    if (campaignPortraitId != null && !isUuid(campaignPortraitId)) {
      return { success: false, error: 'Invalid campaign portrait' };
    }

    const updates: {
      image_url?: string | null;
      campaign_portrait_id?: string | null;
      updated_at: string;
    } = { updated_at: new Date().toISOString() };

    if (campaignPortraitId) {
      updates.campaign_portrait_id = campaignPortraitId;
      updates.image_url = null;
    } else if (imageUrl === null && campaignPortraitId === null) {
      updates.image_url = null;
      updates.campaign_portrait_id = null;
    } else if (imageUrl !== undefined) {
      updates.image_url = imageUrl;
      if (imageUrl !== null) {
        updates.campaign_portrait_id = null;
      }
    }

    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', campaignId)
      .select('image_url, campaign_portrait_id, updated_at')
      .single();

    if (error) {
      throw error;
    }

    invalidateCampaignCore(campaignId);
    invalidateUser(user.id);

    return { success: true, data };
  } catch (error) {
    console.error('Error updating campaign image:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update campaign image' };
  }
}
