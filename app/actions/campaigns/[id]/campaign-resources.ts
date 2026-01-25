'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/utils/cache-tags";
import { getAuthenticatedUser } from '@/utils/auth';

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
 * Check if user is owner or arbitrator of the campaign
 */
async function checkCampaignPermissions(supabase: any, campaignId: string, userId: string): Promise<boolean> {
  // Check if user is admin first (most permissive)
  const { data: profile } = await supabase
    .from('profiles')
    .select('user_role')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.user_role === 'admin') return true;

  // Check campaign members - a user can have multiple member entries
  const { data: members, error } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId);

  if (error || !members || members.length === 0) return false;
  
  // Check if any of the user's member entries has OWNER or ARBITRATOR role
  return members.some((member: { role: string }) => member.role === 'OWNER' || member.role === 'ARBITRATOR');
}

/**
 * Create a custom resource for a campaign (arbitrator/owner only)
 */
export async function createCampaignResource(params: CreateCampaignResourceParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // Check permissions
    const hasPermission = await checkCampaignPermissions(supabase, params.campaignId, user.id);
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
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_BASIC(params.campaignId));
    revalidateTag(CACHE_TAGS.COMPOSITE_CAMPAIGN_OVERVIEW(params.campaignId));
    // Also invalidate the specific resource cache
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_RESOURCES(params.campaignId));

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
    const hasPermission = await checkCampaignPermissions(supabase, params.campaignId, user.id);
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
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_BASIC(params.campaignId));
    revalidateTag(CACHE_TAGS.COMPOSITE_CAMPAIGN_OVERVIEW(params.campaignId));
    // Also invalidate the specific resource cache
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_RESOURCES(params.campaignId));
    // Invalidate campaign members cache since resource names may have changed
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_MEMBERS(params.campaignId));

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
    const hasPermission = await checkCampaignPermissions(supabase, params.campaignId, user.id);
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
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_BASIC(params.campaignId));
    revalidateTag(CACHE_TAGS.COMPOSITE_CAMPAIGN_OVERVIEW(params.campaignId));
    // Also invalidate the specific resource cache
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_RESOURCES(params.campaignId));
    // Invalidate campaign members cache since resource data has changed
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_MEMBERS(params.campaignId));

    return { success: true };
  } catch (error) {
    console.error('Error deleting campaign resource:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete resource'
    };
  }
}
