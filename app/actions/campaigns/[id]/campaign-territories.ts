'use server';

import { invalidateCampaign, invalidateGangCampaignMembership, purgePreEditionCampaignCatalogCachesOnce } from '@/utils/cache-tags';
import { createClient } from "@/utils/supabase/server";
import { logTerritoryLost, logTerritoryClaimed } from "../../logs/gang-campaign-logs";
import { getAuthenticatedUser } from '@/utils/auth';
import { checkCampaignArbitrator } from '@/utils/user-permissions';
import { editionsConflict, editionSlugFromJoin } from '@/types/edition';
import { normaliseTerritoryName, validateTerritoryName } from '@/utils/campaigns/territory-name';


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
  /** When provided, renames the campaign territory instance (owners/arbitrators only) */
  territory_name?: string;
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

    invalidateCampaign(campaignId);

    // Invalidate gang cache to update territory ownership display
    invalidateGangCampaignMembership(gangId);

    // Also invalidate cache for the gang that lost the territory
    if (currentTerritoryData?.gang_id && currentTerritoryData.gang_id !== gangId) {
      invalidateGangCampaignMembership(currentTerritoryData.gang_id);
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

    invalidateCampaign(campaignId);
    
    // Invalidate gang cache to update territory ownership display
    if (territoryData?.gang_id) {
      invalidateGangCampaignMembership(territoryData.gang_id);
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
 * Add a territory to a campaign with targeted cache invalidation.
 * Only campaign owners, arbitrators, and system admins may call this.
 */
export async function addTerritoryToCampaign(params: AddTerritoryParams) {
  try {
    const supabase = await createClient();
    const { campaignId, territoryId } = params;

    if (!territoryId) {
      throw new Error('Territory ID is required');
    }

    const user = await getAuthenticatedUser(supabase);

    const hasPermission = await checkCampaignArbitrator(user.id, campaignId);
    if (!hasPermission) {
      return { success: false, error: 'Only campaign owners and arbitrators can add territories' };
    }

    const [{ data: campaign, error: campaignError }, { data: templateTerritory, error: templateError }] =
      await Promise.all([
        supabase
          .from('campaigns')
          .select('campaign_types!campaign_type_id(editions:edition_id(slug))')
          .eq('id', campaignId)
          .single(),
        supabase
          .from('territories')
          .select('territory_name, playing_card, editions:edition_id(slug)')
          .eq('id', territoryId)
          .maybeSingle(),
      ]);

    if (campaignError || !campaign) {
      return { success: false, error: 'Campaign not found' };
    }
    if (templateError) {
      console.error('Error fetching territory template:', templateError);
      return { success: false, error: 'Failed to load territory template' };
    }
    if (!templateTerritory) {
      return { success: false, error: 'Territory not found' };
    }

    const campaignEdition = editionSlugFromJoin((campaign as any).campaign_types?.editions);
    const territoryEdition = editionSlugFromJoin((templateTerritory as any).editions);

    if (editionsConflict(campaignEdition, territoryEdition)) {
      return {
        success: false,
        error: 'This territory is from a different edition than the campaign',
      };
    }

    const insertData: Record<string, unknown> = {
      campaign_id: campaignId,
      territory_id: territoryId,
      territory_name: templateTerritory.territory_name
    };

    const rawCard = templateTerritory.playing_card;
    insertData.playing_card =
      typeof rawCard === 'string' && rawCard.trim() ? rawCard.trim() : null;

    const { error } = await supabase
      .from('campaign_territories')
      .insert([insertData]);

    if (error) throw error;

    invalidateCampaign(campaignId);
    purgePreEditionCampaignCatalogCachesOnce();

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

    const trimmedName = normaliseTerritoryName(territoryName);
    const nameError = validateTerritoryName(trimmedName);
    if (nameError) {
      return { success: false, error: nameError };
    }

    const user = await getAuthenticatedUser(supabase);

    const hasPermission = await checkCampaignArbitrator(user.id, campaignId);
    if (!hasPermission) {
      return { success: false, error: 'Only campaign owners and arbitrators can create custom territories' };
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

    invalidateCampaign(campaignId);

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

    invalidateCampaign(campaignId);
    
    if (territoryData?.gang_id) {
      invalidateGangCampaignMembership(territoryData.gang_id);
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
    const {
      campaignId,
      territoryId,
      ruined,
      default_gang_territory,
      playing_card,
      description,
      territory_name
    } = params;

    // Get current territory so we can invalidate gang cache and detect renames
    const { data: territoryData, error: selectError } = await supabase
      .from('campaign_territories')
      .select('gang_id, territory_name')
      .eq('id', territoryId)
      .eq('campaign_id', campaignId)
      .single();

    if (selectError || !territoryData) {
      console.error('Error fetching territory for status update:', selectError);
      return { success: false, error: 'Territory not found' };
    }

    const updatePayload: Record<string, unknown> = {
      ruined: ruined,
      default_gang_territory: default_gang_territory,
      playing_card: playing_card,
      description: description
    };

    // Only authorize/validate rename when a new name is provided and it differs
    if (territory_name !== undefined) {
      const normalisedName = normaliseTerritoryName(territory_name);
      const currentName = normaliseTerritoryName(territoryData.territory_name);

      if (normalisedName !== currentName) {
        const user = await getAuthenticatedUser(supabase);
        const hasPermission = await checkCampaignArbitrator(user.id, campaignId);
        if (!hasPermission) {
          return {
            success: false,
            error: 'Only campaign owners and arbitrators can rename territories'
          };
        }

        const nameError = validateTerritoryName(normalisedName);
        if (nameError) {
          return { success: false, error: nameError };
        }

        updatePayload.territory_name = normalisedName;
      }
    }

    const { error } = await supabase
      .from('campaign_territories')
      .update(updatePayload)
      .eq('id', territoryId)
      .eq('campaign_id', campaignId);

    if (error) throw error;

    invalidateCampaign(campaignId);

    // Invalidate gang cache to update territory display on gang page
    if (territoryData.gang_id) {
      invalidateGangCampaignMembership(territoryData.gang_id);
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