'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

export interface UpdateCampaignSettingsParams {
  campaignId: string;
  campaign_name: string;
  has_meat: boolean;
  has_exploration_points: boolean;
  has_scavenging_rolls: boolean;
}

/**
 * Update campaign settings
 */
export async function updateCampaignSettings(params: UpdateCampaignSettingsParams) {
  try {
    const supabase = await createClient();
    const { campaignId, campaign_name, has_meat, has_exploration_points, has_scavenging_rolls } = params;
    
    const { error } = await supabase
      .from('campaigns')
      .update({
        campaign_name,
        has_meat,
        has_exploration_points,
        has_scavenging_rolls,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId);

    if (error) throw error;

    // Invalidate campaign basic cache
    revalidateTag('campaign-basic');

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
 * Delete a campaign
 */
export async function deleteCampaign(campaignId: string) {
  try {
    const supabase = await createClient();
    
    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', campaignId);

    if (error) throw error;

    // Invalidate all campaign caches
    revalidateTag('campaign-basic');
    revalidateTag('campaign-members');
    revalidateTag('campaign-territories');
    revalidateTag('campaign-battles');

    return { success: true };
  } catch (error) {
    console.error('Error deleting campaign:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to delete campaign' 
    };
  }
} 