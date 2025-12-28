'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidateTag } from "next/cache";
import { invalidateCampaignMembership, invalidateCampaignTerritory, invalidateGangPermissionsForUser } from "@/utils/cache-tags";
import { getAuthenticatedUser } from '@/utils/auth';

export interface AddGangToCampaignDirectParams {
  campaignId: string;
  gangId: string;
  allegianceId?: string | null;
  isCustomAllegiance?: boolean;
}

export interface RemoveGangFromCampaignDirectParams {
  campaignId: string;
  gangId: string;
}

/**
 * Add a gang directly to a campaign
 * This simplified version automatically handles member lookup
 */
export async function addGangToCampaignDirect(params: AddGangToCampaignDirectParams) {
  try {
    const supabase = await createClient();
    
    // Authenticate user
    const user = await getAuthenticatedUser(supabase);
    const { campaignId, gangId } = params;
    
    // Get the gang's owner
    const { data: gangData, error: gangError } = await supabase
      .from('gangs')
      .select('user_id, name')
      .eq('id', gangId)
      .single();
    
    if (gangError) throw gangError;
    if (!gangData) throw new Error('Gang not found');
    
    const userId = gangData.user_id;
    
    // Check if this user is already a campaign member
    let campaignMemberId: string;
    const { data: existingMember, error: memberFetchError } = await supabase
      .from('campaign_members')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('user_id', userId)
      .maybeSingle();
    
    if (memberFetchError) throw memberFetchError;
    
    if (existingMember) {
      campaignMemberId = existingMember.id;
    } else {
      // Create a new campaign member entry
      const { data: newMember, error: memberInsertError } = await supabase
        .from('campaign_members')
        .insert({
          campaign_id: campaignId,
          user_id: userId,
          role: 'MEMBER',
          invited_at: new Date().toISOString(),
          invited_by: user.id
        })
        .select('id')
        .single();
      
      if (memberInsertError) throw memberInsertError;
      if (!newMember) throw new Error('Failed to create campaign member');
      
      campaignMemberId = newMember.id;
    }
    
    // Prepare allegiance fields
    const allegianceData: any = {};
    if (params.allegianceId) {
      if (params.isCustomAllegiance) {
        allegianceData.campaign_allegiance_id = params.allegianceId;
        allegianceData.campaign_type_allegiance_id = null;
      } else {
        allegianceData.campaign_type_allegiance_id = params.allegianceId;
        allegianceData.campaign_allegiance_id = null;
      }
    }

    // Add the gang to the campaign
    const now = new Date().toISOString();
    const { error: insertError } = await supabase
      .from('campaign_gangs')
      .insert({
        campaign_id: campaignId,
        gang_id: gangId,
        user_id: userId,
        campaign_member_id: campaignMemberId,
        status: 'ACCEPTED',
        invited_at: now,
        joined_at: now,
        invited_by: user.id,
        ...allegianceData
      });
    
    if (insertError) throw insertError;
    
    // Use granular campaign membership invalidation
    invalidateCampaignMembership({
      campaignId: campaignId,
      gangId: gangId,
      userId: userId,
      action: 'join'
    });

    // Invalidate permission cache
    invalidateGangPermissionsForUser({
      userId: userId,
      gangId: gangId
    });

    // Also invalidate campaign gangs modal data
    revalidateTag(`campaign-gangs-${campaignId}`);
    revalidateTag(`campaign-${campaignId}`); // Legacy compatibility
    
    return { 
      success: true,
      message: `Added ${gangData.name} to the campaign`
    };
  } catch (error) {
    console.error('Error adding gang to campaign:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to add gang to campaign' 
    };
  }
}

/**
 * Remove a gang directly from a campaign
 * This simplified version handles territory cleanup automatically
 */
export async function removeGangFromCampaignDirect(params: RemoveGangFromCampaignDirectParams) {
  try {
    const supabase = await createClient();
    
    // Authenticate user
    await getAuthenticatedUser(supabase);
    const { campaignId, gangId } = params;
    
    // Get the gang's owner and name
    const { data: gangData, error: gangError } = await supabase
      .from('gangs')
      .select('user_id, name')
      .eq('id', gangId)
      .single();
    
    if (gangError) throw gangError;
    if (!gangData) throw new Error('Gang not found');
    
    // First, update any territories controlled by this gang
    const { error: territoryError } = await supabase
      .from('campaign_territories')
      .update({ gang_id: null })
      .eq('campaign_id', campaignId)
      .eq('gang_id', gangId);
    
    if (territoryError) throw territoryError;
    
    // Remove the gang from the campaign
    const { error: deleteError } = await supabase
      .from('campaign_gangs')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('gang_id', gangId);
    
    if (deleteError) throw deleteError;
    
    // Use granular campaign membership invalidation
    invalidateCampaignMembership({
      campaignId: campaignId,
      gangId: gangId,
      userId: gangData.user_id,
      action: 'leave'
    });

    // Invalidate permission cache
    invalidateGangPermissionsForUser({
      userId: gangData.user_id,
      gangId: gangId
    });

    // Invalidate territory cache since we modified territories
    invalidateCampaignTerritory({
      campaignId: campaignId,
      gangId: gangId
    });
    
    // Also invalidate campaign gangs modal data
    revalidateTag(`campaign-gangs-${campaignId}`);
    revalidateTag(`campaign-${campaignId}`); // Legacy compatibility
    
    return { 
      success: true,
      message: `Removed ${gangData.name} from the campaign`
    };
  } catch (error) {
    console.error('Error removing gang from campaign:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to remove gang from campaign' 
    };
  }
}
