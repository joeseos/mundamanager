'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidateTag } from "next/cache";
import { TAGS } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';
import { checkCampaignArbitrator } from '@/utils/user-permissions';

export interface CreateCampaignAllegianceParams {
  campaignId: string;
  allegiance_name: string;
}

export interface UpdateCampaignAllegianceParams {
  campaignId: string;
  allegianceId: string;
  allegiance_name?: string;
}

export interface DeleteCampaignAllegianceParams {
  campaignId: string;
  allegianceId: string;
}

export interface UpdateGangAllegianceParams {
  gangId: string;
  campaignId: string;
  allegianceId: string | null;
  isCustom: boolean;
}

/**
 * Create a custom allegiance for a campaign (arbitrator/owner only)
 */
export async function createCampaignAllegiance(params: CreateCampaignAllegianceParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Check permissions
    const hasPermission = await checkCampaignArbitrator(user.id, params.campaignId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'Only campaign owners and arbitrators can create allegiances'
      };
    }

    // Verify campaign is custom
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('campaign_type_id')
      .eq('id', params.campaignId)
      .single();

    if (campaignError) throw campaignError;
    if (!campaign || !campaign.campaign_type_id) {
      return {
        success: false,
        error: 'Campaign not found'
      };
    }

    // Allow custom allegiances for all campaign types
    const { data, error } = await supabase
      .from('campaign_allegiances')
      .insert({
        campaign_id: params.campaignId,
        allegiance_name: params.allegiance_name.trim()
      })
      .select()
      .single();

    if (error) throw error;

    // Invalidate campaign cache
    revalidateTag(TAGS.campaign(params.campaignId), { expire: 0 });
    revalidateTag(TAGS.campaign(params.campaignId), { expire: 0 });
    // Also invalidate the specific allegiance cache
    revalidateTag(TAGS.campaign(params.campaignId), { expire: 0 });

    return { success: true, data };
  } catch (error) {
    console.error('Error creating campaign allegiance:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create allegiance'
    };
  }
}

/**
 * Update a custom campaign allegiance (arbitrator/owner only)
 */
export async function updateCampaignAllegiance(params: UpdateCampaignAllegianceParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Check permissions
    const hasPermission = await checkCampaignArbitrator(user.id, params.campaignId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'Only campaign owners and arbitrators can update allegiances'
      };
    }

    const updateData: any = {
      updated_at: new Date().toISOString()
    };
    if (params.allegiance_name !== undefined) {
      updateData.allegiance_name = params.allegiance_name.trim();
    }

    const { data, error } = await supabase
      .from('campaign_allegiances')
      .update(updateData)
      .eq('id', params.allegianceId)
      .eq('campaign_id', params.campaignId)
      .select()
      .single();

    if (error) throw error;

    // Invalidate campaign cache
    revalidateTag(TAGS.campaign(params.campaignId), { expire: 0 });
    revalidateTag(TAGS.campaign(params.campaignId), { expire: 0 });
    // Also invalidate the specific allegiance cache
    revalidateTag(TAGS.campaign(params.campaignId), { expire: 0 });

    // Invalidate all gangs in this campaign (allegiance name might have changed)
    const { data: campaignGangs } = await supabase
      .from('campaign_gangs')
      .select('gang_id')
      .eq('campaign_id', params.campaignId);

    if (campaignGangs) {
      campaignGangs.forEach(gang => {
        revalidateTag(TAGS.gangCampaigns(gang.gang_id), { expire: 0 });
      });
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error updating campaign allegiance:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update allegiance'
    };
  }
}

/**
 * Delete a custom campaign allegiance (arbitrator/owner only)
 */
export async function deleteCampaignAllegiance(params: DeleteCampaignAllegianceParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Check permissions
    const hasPermission = await checkCampaignArbitrator(user.id, params.campaignId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'Only campaign owners and arbitrators can delete allegiances'
      };
    }

    // Get gang IDs that are using this allegiance (for cache invalidation)
    // Note: We fetch this right before deletion to minimize race condition window.
    // The database constraint ON DELETE SET NULL will automatically clear the allegiance
    // from any gangs that reference it atomically, including any assigned between
    // this fetch and deletion. This ensures data integrity at the database level.
    const { data: affectedGangs } = await supabase
      .from('campaign_gangs')
      .select('gang_id')
      .eq('campaign_id', params.campaignId)
      .eq('campaign_allegiance_id', params.allegianceId);

    // Delete the allegiance - the database constraint ON DELETE SET NULL will automatically
    // set campaign_allegiance_id to NULL for all referencing rows atomically.
    // This eliminates the race condition: even if a gang is assigned this allegiance
    // between the fetch above and this delete, the database will handle it correctly.
    const { error } = await supabase
      .from('campaign_allegiances')
      .delete()
      .eq('id', params.allegianceId)
      .eq('campaign_id', params.campaignId);

    if (error) throw error;

    // Invalidate caches for affected gangs we found.
    // Note: The database constraint ensures all gangs (including any assigned during
    // the race window) are properly cleared. Cache invalidation here is for UI updates.
    // Any gangs assigned during the race window will have correct data on next fetch.
    if (affectedGangs) {
      affectedGangs.forEach(gang => {
        revalidateTag(TAGS.gangCampaigns(gang.gang_id), { expire: 0 });
      });
    }

    // Invalidate campaign cache
    revalidateTag(TAGS.campaign(params.campaignId), { expire: 0 });
    revalidateTag(TAGS.campaign(params.campaignId), { expire: 0 });
    // Also invalidate the specific allegiance cache
    revalidateTag(TAGS.campaign(params.campaignId), { expire: 0 });

    return { success: true };
  } catch (error) {
    console.error('Error deleting campaign allegiance:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete allegiance'
    };
  }
}

/**
 * Update a gang's allegiance for a campaign
 */
export async function updateGangAllegiance(params: UpdateGangAllegianceParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Verify gang belongs to user OR user is arbitrator/owner
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('user_id, id')
      .eq('id', params.gangId)
      .single();

    if (gangError) throw gangError;
    if (!gang) {
      return {
        success: false,
        error: 'Gang not found'
      };
    }

    // Check if user owns the gang or is an arbitrator/owner
    const isGangOwner = gang.user_id === user.id;
    const isCampaignAdmin = await checkCampaignArbitrator(user.id, params.campaignId);

    if (!isGangOwner && !isCampaignAdmin) {
      return {
        success: false,
        error: 'You can only update allegiances for your own gangs or if you are a campaign arbitrator/owner'
      };
    }

    // Verify gang is in the campaign and get the campaign_gangs record
    const { data: campaignGang, error: campaignGangError } = await supabase
      .from('campaign_gangs')
      .select('id')
      .eq('gang_id', params.gangId)
      .eq('campaign_id', params.campaignId)
      .single();

    if (campaignGangError || !campaignGang) {
      return {
        success: false,
        error: 'Gang is not part of this campaign'
      };
    }

    // Update allegiance in campaign_gangs
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (params.allegianceId === null) {
      // Clear allegiance
      updateData.campaign_type_allegiance_id = null;
      updateData.campaign_allegiance_id = null;
    } else if (params.isCustom) {
      updateData.campaign_allegiance_id = params.allegianceId;
      updateData.campaign_type_allegiance_id = null;
    } else {
      updateData.campaign_type_allegiance_id = params.allegianceId;
      updateData.campaign_allegiance_id = null;
    }

    const { error: updateError } = await supabase
      .from('campaign_gangs')
      .update(updateData)
      .eq('id', campaignGang.id);

    if (updateError) throw updateError;

    // Invalidate caches
    revalidateTag(TAGS.gangCampaigns(params.gangId), { expire: 0 });
    revalidateTag(TAGS.campaign(params.campaignId), { expire: 0 });
    revalidateTag(TAGS.campaign(params.campaignId), { expire: 0 });
    revalidateTag(TAGS.campaign(params.campaignId), { expire: 0 });

    return { success: true };
  } catch (error) {
    console.error('Error updating gang allegiance:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update gang allegiance'
    };
  }
}

