'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/utils/cache-tags";
import { logTerritoryLost, logTerritoryClaimed } from "../../logs/gang-campaign-logs";
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
  territoryId: string;
  territoryName: string;
}

export interface CreateCustomCampaignTerritoryParams {
  campaignId: string;
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
  /** Stored on `campaign_territories.playing_card`; null clears the value */
  playing_card: string | null;
  /** Stored on `campaign_territories.description`; null clears the value */
  description: string | null;
}

/**
 * Assign a gang to a territory with targeted cache invalidation
 */
export async function assignGangToTerritory(params: AssignGangToTerritoryParams) {
  try {
    const supabase = await createClient();
    const { campaignId, territoryId, gangId } = params;
    
    // Get current territory data to check if another gang is losing it
    const { data: currentTerritoryData, error: selectError } = await supabase
      .from('campaign_territories')
      .select('gang_id, territory_name, territory_id, campaign_id')
      .eq('id', territoryId)
      .eq('campaign_id', campaignId)
      .single();
    
    if (selectError) {
      console.error('Error fetching current territory data:', selectError);
    }
    
    // Get gang and campaign names for logging
    let newGangName = null;
    let oldGangName = null;
    let campaignName = null;
    
    // Get the new gang's name
    const { data: newGangData } = await supabase
      .from('gangs')
      .select('name')
      .eq('id', gangId)
      .single();
    newGangName = newGangData?.name;
    
    // Get the old gang's name if there was one
    if (currentTerritoryData?.gang_id) {
      const { data: oldGangData } = await supabase
        .from('gangs')
        .select('name')
        .eq('id', currentTerritoryData.gang_id)
        .single();
      oldGangName = oldGangData?.name;
    }
    
    // Get campaign name
    if (currentTerritoryData?.campaign_id) {
      const { data: campaignData } = await supabase
        .from('campaigns')
        .select('campaign_name')
        .eq('id', currentTerritoryData.campaign_id)
        .single();
      campaignName = campaignData?.campaign_name;
    }
    
    const { error } = await supabase
      .from('campaign_territories')
      .update({ gang_id: gangId })
      .eq('id', territoryId)
      .eq('campaign_id', campaignId);

    if (error) throw error;

    // Log territory changes
    if (currentTerritoryData && campaignName) {
      try {
        // Log territory loss for the previous owner (if any)
        if (currentTerritoryData.gang_id && oldGangName && currentTerritoryData.gang_id !== gangId) {
          await logTerritoryLost({
            gang_id: currentTerritoryData.gang_id,
            gang_name: oldGangName,
            territory_name: currentTerritoryData.territory_name,
            campaign_name: campaignName,
            is_custom: !currentTerritoryData.territory_id
          });
        }
        
        // Log territory claim for the new owner
        if (newGangName) {
          await logTerritoryClaimed({
            gang_id: gangId,
            gang_name: newGangName,
            territory_name: currentTerritoryData.territory_name,
            campaign_name: campaignName,
            is_custom: !currentTerritoryData.territory_id
          });
        }
      } catch (logError) {
        console.error('Error logging territory assignment:', logError);
        // Don't fail the main operation if logging fails
      }
    }

    // 🎯 TARGETED CACHE INVALIDATION
    // Invalidate only the affected campaign's territories
    revalidateTag(`campaign-territories-${campaignId}`);
    // Also invalidate the general campaign cache for this specific campaign
    revalidateTag(`campaign-${campaignId}`);

    // Invalidate gang cache to update territory ownership display
    revalidateTag(CACHE_TAGS.COMPOSITE_GANG_CAMPAIGNS(gangId));

    // Also invalidate cache for the gang that lost the territory
    if (currentTerritoryData?.gang_id && currentTerritoryData.gang_id !== gangId) {
      revalidateTag(CACHE_TAGS.COMPOSITE_GANG_CAMPAIGNS(currentTerritoryData.gang_id));
    }

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
    
    // Get the gang and territory info before removing it so we can log and invalidate cache
    const { data: territoryData, error: selectError } = await supabase
      .from('campaign_territories')
      .select('gang_id, territory_name, territory_id, campaign_id')
      .eq('id', territoryId)
      .eq('campaign_id', campaignId)
      .single();
    
    if (selectError) {
      console.error('Error fetching territory data:', selectError);
    }
    
    // Get gang and campaign names separately
    let gangName = null;
    let campaignName = null;
    
    if (territoryData?.gang_id) {
      const { data: gangData } = await supabase
        .from('gangs')
        .select('name')
        .eq('id', territoryData.gang_id)
        .single();
      gangName = gangData?.name;
    }
    
    if (territoryData?.campaign_id) {
      const { data: campaignData } = await supabase
        .from('campaigns')
        .select('campaign_name')
        .eq('id', territoryData.campaign_id)
        .single();
      campaignName = campaignData?.campaign_name;
    }
    
    const { error } = await supabase
      .from('campaign_territories')
      .update({ gang_id: null })
      .eq('id', territoryId)
      .eq('campaign_id', campaignId);

    if (error) throw error;
    
    // Log territory loss for the gang that lost it
    if (territoryData?.gang_id && gangName && campaignName) {
      try {
        await logTerritoryLost({
          gang_id: territoryData.gang_id,
          gang_name: gangName,
          territory_name: territoryData.territory_name,
          campaign_name: campaignName,
          is_custom: !territoryData.territory_id
        });
      } catch (logError) {
        console.error('Error logging territory loss:', logError);
        // Don't fail the main operation if logging fails
      }
    }

    // 🎯 TARGETED CACHE INVALIDATION
    // Invalidate only the affected campaign's territories
    revalidateTag(`campaign-territories-${campaignId}`);
    // Also invalidate the general campaign cache for this specific campaign
    revalidateTag(`campaign-${campaignId}`);
    
    // Invalidate gang cache to update territory ownership display
    if (territoryData?.gang_id) {
      revalidateTag(CACHE_TAGS.COMPOSITE_GANG_CAMPAIGNS(territoryData.gang_id));
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
    const { campaignId, territoryId, territoryName } = params;

    if (!territoryId) {
      throw new Error('Territory ID is required');
    }

    const insertData: Record<string, unknown> = {
      campaign_id: campaignId,
      territory_id: territoryId,
      territory_name: territoryName
    };

    const { data: templateTerritory, error: templateError } = await supabase
      .from('territories')
      .select('playing_card')
      .eq('id', territoryId)
      .maybeSingle();

    if (templateError) {
      console.error('Error fetching territory template for playing_card:', templateError);
    }
    const rawCard = templateTerritory?.playing_card;
    insertData.playing_card =
      typeof rawCard === 'string' && rawCard.trim() ? rawCard.trim() : null;

    const { error } = await supabase
      .from('campaign_territories')
      .insert([insertData]);

    if (error) throw error;

    revalidateTag(`campaign-territories-${campaignId}`);
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
 * Create a custom territory directly in a campaign (no predefined template).
 * Only campaign owners, arbitrators, and system admins may call this.
 */
export async function createCustomCampaignTerritory(params: CreateCustomCampaignTerritoryParams) {
  try {
    const supabase = await createClient();
    const { campaignId, territoryName } = params;

    const trimmedName = territoryName.trim();
    if (!trimmedName) {
      return { success: false, error: 'Territory name is required' };
    }

    const user = await getAuthenticatedUser(supabase);

    // Permission check: admin, owner, or arbitrator
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.user_role !== 'admin') {
      const { data: members, error: memberError } = await supabase
        .from('campaign_members')
        .select('role')
        .eq('campaign_id', campaignId)
        .eq('user_id', user.id);

      if (memberError || !members || members.length === 0) {
        return { success: false, error: 'Only campaign owners and arbitrators can create custom territories' };
      }

      const hasPermission = members.some(
        (m: { role: string }) => m.role === 'OWNER' || m.role === 'ARBITRATOR'
      );
      if (!hasPermission) {
        return { success: false, error: 'Only campaign owners and arbitrators can create custom territories' };
      }
    }

    const { error } = await supabase
      .from('campaign_territories')
      .insert([{
        campaign_id: campaignId,
        territory_name: trimmedName,
        territory_id: null,
        playing_card: null
      }]);

    if (error) throw error;

    revalidateTag(`campaign-territories-${campaignId}`);
    revalidateTag(`campaign-${campaignId}`);

    return { success: true };
  } catch (error) {
    console.error('Error creating custom campaign territory:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create custom territory'
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
    
    // Get the gang and territory info before removing it so we can log
    const { data: territoryData, error: selectError } = await supabase
      .from('campaign_territories')
      .select('gang_id, territory_name, territory_id, campaign_id')
      .eq('id', territoryId)
      .eq('campaign_id', campaignId)
      .single();
    
    if (selectError) {
      console.error('Error fetching territory data for removal:', selectError);
    }
    
    // Get gang and campaign names separately
    let gangName = null;
    let campaignName = null;
    
    if (territoryData?.gang_id) {
      const { data: gangData } = await supabase
        .from('gangs')
        .select('name')
        .eq('id', territoryData.gang_id)
        .single();
      gangName = gangData?.name;
    }
    
    if (territoryData?.campaign_id) {
      const { data: campaignData } = await supabase
        .from('campaigns')
        .select('campaign_name')
        .eq('id', territoryData.campaign_id)
        .single();
      campaignName = campaignData?.campaign_name;
    }
    
    console.log('territoryData', territoryData);
    const { error } = await supabase
      .from('campaign_territories')
      .delete()
      .eq('id', territoryId)
      .eq('campaign_id', campaignId);

    if (error) throw error;

    // Log territory loss for the gang that owned it (if any)
    if (territoryData?.gang_id && gangName && campaignName) {
      try {
        await logTerritoryLost({
          gang_id: territoryData.gang_id,
          gang_name: gangName,
          territory_name: territoryData.territory_name,
          campaign_name: campaignName,
          is_custom: !territoryData.territory_id
        });
      } catch (logError) {
        console.error('Error logging territory loss:', logError);
      }
    }

    revalidateTag(`campaign-territories-${campaignId}`);
    revalidateTag(`campaign-${campaignId}`);
    
    if (territoryData?.gang_id) {
      revalidateTag(CACHE_TAGS.COMPOSITE_GANG_CAMPAIGNS(territoryData.gang_id));
    }

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
    const { campaignId, territoryId, ruined, default_gang_territory, playing_card, description } = params;

    // Get the gang holding this territory so we can invalidate their cache
    const { data: territoryData } = await supabase
      .from('campaign_territories')
      .select('gang_id')
      .eq('id', territoryId)
      .eq('campaign_id', campaignId)
      .single();

    const { error } = await supabase
      .from('campaign_territories')
      .update({ 
        ruined: ruined,
        default_gang_territory: default_gang_territory,
        playing_card: playing_card,
        description: description
      })
      .eq('id', territoryId)
      .eq('campaign_id', campaignId);

    if (error) throw error;

    // 🎯 TARGETED CACHE INVALIDATION
    // Invalidate only the affected campaign's territories
    revalidateTag(`campaign-territories-${campaignId}`);
    // Also invalidate the general campaign cache for this specific campaign
    revalidateTag(`campaign-${campaignId}`);

    // Invalidate gang cache to update territory display on gang page
    if (territoryData?.gang_id) {
      revalidateTag(CACHE_TAGS.COMPOSITE_GANG_CAMPAIGNS(territoryData.gang_id));
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating territory status:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update territory status' 
    };
  }
}