'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CACHE_TAGS } from "@/utils/cache-tags";

export interface UpdateCampaignSettingsParams {
  campaignId: string;
  campaign_name?: string;
  description?: string;
  has_meat?: boolean;
  has_exploration_points?: boolean;
  has_scavenging_rolls?: boolean;
  note?: string;
}

/**
 * Update campaign settings with targeted cache invalidation
 */
export async function updateCampaignSettings(params: UpdateCampaignSettingsParams) {
  try {
    const supabase = await createClient();
    const {
      campaignId,
      campaign_name,
      description,
      has_meat,
      has_exploration_points,
      has_scavenging_rolls,
      note
    } = params;

    // Only include provided fields in the update
    const updateData: any = { updated_at: new Date().toISOString() };
    if (campaign_name !== undefined) updateData.campaign_name = campaign_name.trimEnd();
    if (description !== undefined) updateData.description = description;
    if (has_meat !== undefined) updateData.has_meat = has_meat;
    if (has_exploration_points !== undefined) updateData.has_exploration_points = has_exploration_points;
    if (has_scavenging_rolls !== undefined) updateData.has_scavenging_rolls = has_scavenging_rolls;
    if (note !== undefined) updateData.note = note;

    const { error } = await supabase
      .from('campaigns')
      .update(updateData)
      .eq('id', campaignId);

    if (error) throw error;

    // Get all gangs in this campaign to invalidate their caches
    const { data: campaignGangs } = await supabase
      .from('campaign_gangs')
      .select('gang_id')
      .eq('campaign_id', campaignId);

    // 🎯 TARGETED CACHE INVALIDATION
    revalidateTag(`campaign-basic-${campaignId}`);
    revalidateTag(`campaign-${campaignId}`);
    
    // Invalidate gang caches to update campaign resource settings display
    if (campaignGangs && campaignGangs.length > 0) {
      campaignGangs.forEach(gang => {
        revalidateTag(CACHE_TAGS.GANG_OVERVIEW(gang.gang_id));
        revalidateTag(`gang-details-${gang.gang_id}`);
        revalidatePath(`/gang/${gang.gang_id}`);
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating campaign settings:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update campaign settings' 
    };
  }
}

/**
 * Delete a campaign with comprehensive cache invalidation
 */
export async function deleteCampaign(campaignId: string) {
  try {
    const supabase = await createClient();
    
    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', campaignId);

    if (error) throw error;

    // 🎯 COMPREHENSIVE CACHE INVALIDATION FOR DELETED CAMPAIGN
    // Invalidate all caches related to the deleted campaign
    revalidateTag(`campaign-basic-${campaignId}`);
    revalidateTag(`campaign-members-${campaignId}`);
    revalidateTag(`campaign-territories-${campaignId}`);
    revalidateTag(`campaign-battles-${campaignId}`);
    revalidateTag(`campaign-${campaignId}`);

    // Also invalidate global caches if needed
    // (e.g., if you have a campaigns list cache)
    revalidateTag('campaigns-list');

    return { success: true };
  } catch (error) {
    console.error('Error deleting campaign:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to delete campaign' 
    };
  }
}