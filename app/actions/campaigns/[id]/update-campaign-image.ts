'use server';

import { invalidateCampaignCore, invalidateUser } from '@/utils/cache-tags';
import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { isUuid } from '@/utils/uuid';
import { portraitBelongsToCampaignType } from '@/app/lib/campaigns/campaign-portrait-check';

/**
 * custom: a user upload; clears the portrait.
 * portrait: a catalogue portrait; clears the upload.
 * type-image: clears both, so the campaign shows its type image.
 */
export type CampaignImageUpdate =
  | { kind: 'custom'; imageUrl: string }
  | { kind: 'portrait'; portraitId: string }
  | { kind: 'type-image' };

export async function updateCampaignImage(campaignId: string, update: CampaignImageUpdate) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    if (!isUuid(campaignId)) {
      return { success: false, error: 'Invalid campaign' };
    }

    const updates: {
      image_url: string | null;
      campaign_portrait_id: string | null;
      updated_at: string;
    } = { image_url: null, campaign_portrait_id: null, updated_at: new Date().toISOString() };

    if (update.kind === 'custom') {
      const imageUrl = update.imageUrl.trim();
      if (!imageUrl) return { success: false, error: 'Image is missing' };
      updates.image_url = imageUrl;
    } else if (update.kind === 'portrait') {
      if (!isUuid(update.portraitId)) {
        return { success: false, error: 'Invalid campaign portrait' };
      }
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('campaign_type_id')
        .eq('id', campaignId)
        .maybeSingle();
      if (campaignError) throw campaignError;
      if (!campaign) return { success: false, error: 'Campaign not found' };

      const check = await portraitBelongsToCampaignType(supabase, update.portraitId, campaign.campaign_type_id);
      if (!check.success) return check;
      updates.campaign_portrait_id = update.portraitId;
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
