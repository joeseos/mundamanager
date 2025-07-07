'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidateTag } from "next/cache";

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
  territoryId: string;
  territoryName: string;
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
    const { campaignId, territoryId, territoryName } = params;

    const { error } = await supabase
      .from('campaign_territories')
      .insert([{
        campaign_id: campaignId,
        territory_id: territoryId,
        territory_name: territoryName
      }]);

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