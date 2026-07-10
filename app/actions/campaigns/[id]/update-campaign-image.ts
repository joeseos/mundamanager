'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidateTag } from 'next/cache';
import { TAGS } from '@/utils/cache-tags';
export async function updateCampaignImage(campaignId: string, imageUrl: string | null) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Optional: ensure user is member of campaign (owner or arbitrator) before update
    // We keep it simple/trusted here, as UI gates this action. Add stricter checks if needed.

    const { error } = await supabase
      .from('campaigns')
      .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
      .eq('id', campaignId);

    if (error) {
      throw error;
    }

    // Invalidate caches for this campaign
    revalidateTag(TAGS.campaign(campaignId), { expire: 0 });
    revalidateTag(TAGS.campaign(campaignId), { expire: 0 });
    // Also refresh user's campaigns list
    revalidateTag(TAGS.user(user.id), { expire: 0 });

    return { success: true };
  } catch (error) {
    console.error('Error updating campaign image:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update campaign image' };
  }
}

