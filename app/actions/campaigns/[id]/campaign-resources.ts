'use server';

import { invalidateCampaign } from '@/utils/cache-tags';
import { createClient } from "@/utils/supabase/server";

import { getAuthenticatedUser } from '@/utils/auth';
import { checkCampaignArbitrator } from '@/utils/user-permissions';

export interface CreateCampaignResourceParams {
  campaignId: string;
  resource_name: string;
}

export interface UpdateCampaignResourceParams {
  campaignId: string;
  resourceId: string;
  resource_name?: string;
}

export interface DeleteCampaignResourceParams {
  campaignId: string;
  resourceId: string;
}

/**
 * Create a custom resource for a campaign (arbitrator/owner only)
 */
export async function createCampaignResource(params: CreateCampaignResourceParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Check permissions
    const hasPermission = await checkCampaignArbitrator(user.id, params.campaignId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'Only campaign owners and arbitrators can create resources'
      };
    }

    // Verify campaign exists
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

    // Allow custom resources for all campaign types
    const { data, error } = await supabase
      .from('campaign_resources')
      .insert({
        campaign_id: params.campaignId,
        resource_name: params.resource_name.trim()
      })
      .select()
      .single();

    if (error) throw error;

    // Invalidate campaign cache
    invalidateCampaign(params.campaignId);
    invalidateCampaign(params.campaignId);
    // Also invalidate the specific resource cache
    invalidateCampaign(params.campaignId);

    return { success: true, data };
  } catch (error) {
    console.error('Error creating campaign resource:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create resource'
    };
  }
}

/**
 * Update a custom campaign resource (arbitrator/owner only)
 */
export async function updateCampaignResource(params: UpdateCampaignResourceParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Check permissions
    const hasPermission = await checkCampaignArbitrator(user.id, params.campaignId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'Only campaign owners and arbitrators can update resources'
      };
    }

    const updateData: any = {
      updated_at: new Date().toISOString()
    };
    if (params.resource_name !== undefined) {
      updateData.resource_name = params.resource_name.trim();
    }

    const { data, error } = await supabase
      .from('campaign_resources')
      .update(updateData)
      .eq('id', params.resourceId)
      .eq('campaign_id', params.campaignId)
      .select()
      .single();

    if (error) throw error;

    // Invalidate campaign cache
    invalidateCampaign(params.campaignId);
    invalidateCampaign(params.campaignId);
    // Also invalidate the specific resource cache
    invalidateCampaign(params.campaignId);
    // Invalidate campaign members cache since resource names may have changed
    invalidateCampaign(params.campaignId);

    return { success: true, data };
  } catch (error) {
    console.error('Error updating campaign resource:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update resource'
    };
  }
}

/**
 * Delete a custom campaign resource (arbitrator/owner only)
 */
export async function deleteCampaignResource(params: DeleteCampaignResourceParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Check permissions
    const hasPermission = await checkCampaignArbitrator(user.id, params.campaignId);
    if (!hasPermission) {
      return {
        success: false,
        error: 'Only campaign owners and arbitrators can delete resources'
      };
    }

    // Delete the resource - campaign_gang_resources entries will be cascade deleted
    // due to ON DELETE CASCADE constraint
    const { error } = await supabase
      .from('campaign_resources')
      .delete()
      .eq('id', params.resourceId)
      .eq('campaign_id', params.campaignId);

    if (error) throw error;

    // Invalidate campaign cache
    invalidateCampaign(params.campaignId);
    invalidateCampaign(params.campaignId);
    // Also invalidate the specific resource cache
    invalidateCampaign(params.campaignId);
    // Invalidate campaign members cache since resource data has changed
    invalidateCampaign(params.campaignId);

    return { success: true };
  } catch (error) {
    console.error('Error deleting campaign resource:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete resource'
    };
  }
}
