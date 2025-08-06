'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { CACHE_TAGS } from "@/utils/cache-tags";
import { getAuthenticatedUser } from '@/utils/auth';

export interface AssignGangToTerritoryParams {
  campaignId: string;
  territoryId: string;
  gangId: string;
}

export interface RemoveGangFromTerritoryParams {
  campaignId: string;
  territoryId: string;
}

export interface AddTerritoryParams {
  campaignId: string;
  territoryId?: string;
  customTerritoryId?: string;
  territoryName: string;
  isCustom?: boolean;
}

export interface RemoveTerritoryParams {
  campaignId: string;
  territoryId: string;
}

export interface UpdateTerritoryStatusParams {
  campaignId: string;
  territoryId: string;
  ruined: boolean;
  default_gang_territory: boolean;
}

/**
 * Assign a gang to a territory with targeted cache invalidation
 */
export async function assignGangToTerritory(params: AssignGangToTerritoryParams) {
  try {
    const supabase = await createClient();
    const { campaignId, territoryId, gangId } = params;
    
    const { error } = await supabase
      .from('campaign_territories')
      .update({ gang_id: gangId })
      .eq('id', territoryId)
      .eq('campaign_id', campaignId);

    if (error) throw error;

    // 🎯 TARGETED CACHE INVALIDATION
    // Invalidate only the affected campaign's territories
    revalidateTag(`campaign-territories-${campaignId}`);
    // Also invalidate the general campaign cache for this specific campaign
    revalidateTag(`campaign-${campaignId}`);
    
    // Invalidate gang cache to update territory ownership display
    revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(gangId));
    revalidatePath(`/gang/${gangId}`);

    return { success: true };
  } catch (error) {
    console.error('Error assigning gang to territory:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to assign gang to territory' 
    };
  }
}

/**
 * Remove a gang from a territory with targeted cache invalidation
 */
export async function removeGangFromTerritory(params: RemoveGangFromTerritoryParams) {
  try {
    const supabase = await createClient();
    const { campaignId, territoryId } = params;
    
    // Get the gang_id before removing it so we can invalidate its cache
    const { data: territoryData } = await supabase
      .from('campaign_territories')
      .select('gang_id')
      .eq('id', territoryId)
      .eq('campaign_id', campaignId)
      .single();
    
    const { error } = await supabase
      .from('campaign_territories')
      .update({ gang_id: null })
      .eq('id', territoryId)
      .eq('campaign_id', campaignId);

    if (error) throw error;

    // 🎯 TARGETED CACHE INVALIDATION
    // Invalidate only the affected campaign's territories
    revalidateTag(`campaign-territories-${campaignId}`);
    // Also invalidate the general campaign cache for this specific campaign
    revalidateTag(`campaign-${campaignId}`);
    
    // Invalidate gang cache to update territory ownership display
    if (territoryData?.gang_id) {
      revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(territoryData.gang_id));
      revalidatePath(`/gang/${territoryData.gang_id}`);
    }

    return { success: true };
  } catch (error) {
    console.error('Error removing gang from territory:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to remove gang from territory' 
    };
  }
}

/**
 * Add a territory to a campaign with targeted cache invalidation
 */
export async function addTerritoryToCampaign(params: AddTerritoryParams) {
  try {
    const supabase = await createClient();
    const { campaignId, territoryId, customTerritoryId, territoryName, isCustom } = params;

    // Validate that exactly one of territoryId or customTerritoryId is provided
    if (isCustom && !customTerritoryId) {
      throw new Error('Custom territory ID is required for custom territories');
    }
    if (!isCustom && !territoryId) {
      throw new Error('Territory ID is required for regular territories');
    }

    // For custom territories, verify ownership
    if (isCustom && customTerritoryId) {
      const user = await getAuthenticatedUser(supabase);

      const { data: customTerritory, error: customError } = await supabase
        .from('custom_territories')
        .select('id, user_id')
        .eq('id', customTerritoryId)
        .eq('user_id', user.id)
        .single();

      if (customError || !customTerritory) {
        throw new Error('Custom territory not found or access denied');
      }
    }

    const insertData: any = {
      campaign_id: campaignId,
      territory_name: territoryName
    };

    if (isCustom) {
      insertData.custom_territory_id = customTerritoryId;
    } else {
      insertData.territory_id = territoryId;
    }

    const { error } = await supabase
      .from('campaign_territories')
      .insert([insertData]);

    if (error) throw error;

    // 🎯 TARGETED CACHE INVALIDATION
    // Invalidate only the affected campaign's territories
    revalidateTag(`campaign-territories-${campaignId}`);
    // Also invalidate the general campaign cache for this specific campaign
    revalidateTag(`campaign-${campaignId}`);

    return { success: true };
  } catch (error) {
    console.error('Error adding territory to campaign:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to add territory to campaign' 
    };
  }
}

/**
 * Remove a territory from a campaign with targeted cache invalidation
 */
export async function removeTerritoryFromCampaign(params: RemoveTerritoryParams) {
  try {
    const supabase = await createClient();
    const { campaignId, territoryId } = params;
    
    const { error } = await supabase
      .from('campaign_territories')
      .delete()
      .eq('id', territoryId)
      .eq('campaign_id', campaignId);

    if (error) throw error;

    // 🎯 TARGETED CACHE INVALIDATION
    // Invalidate only the affected campaign's territories
    revalidateTag(`campaign-territories-${campaignId}`);
    // Also invalidate the general campaign cache for this specific campaign
    revalidateTag(`campaign-${campaignId}`);

    return { success: true };
  } catch (error) {
    console.error('Error removing territory from campaign:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to remove territory from campaign' 
    };
  }
}

/**
 * Update territory status (ruined) with targeted cache invalidation
 */
export async function updateTerritoryStatus(params: UpdateTerritoryStatusParams) {
  try {
    const supabase = await createClient();
    const { campaignId, territoryId, ruined, default_gang_territory } = params;
    
    const { error } = await supabase
      .from('campaign_territories')
      .update({ 
        ruined: ruined,
        default_gang_territory: default_gang_territory
      })
      .eq('id', territoryId)
      .eq('campaign_id', campaignId);

    if (error) throw error;

    // 🎯 TARGETED CACHE INVALIDATION
    // Invalidate only the affected campaign's territories
    revalidateTag(`campaign-territories-${campaignId}`);
    // Also invalidate the general campaign cache for this specific campaign
    revalidateTag(`campaign-${campaignId}`);

    return { success: true };
  } catch (error) {
    console.error('Error updating territory status:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update territory status' 
    };
  }
}