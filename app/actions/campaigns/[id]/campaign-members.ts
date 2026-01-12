'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS, invalidateCampaignMembership, invalidateGangPermissionsForUser, invalidateCampaignMemberPermissions } from "@/utils/cache-tags";
import { logGangJoinedCampaign, logGangLeftCampaign } from "../../logs/gang-campaign-logs";
import { getAuthenticatedUser } from '@/utils/auth';

export interface AddGangToCampaignParams {
  campaignId: string;
  gangId: string;
  userId: string;
  campaignMemberId?: string;
  allegianceId?: string | null;
  isCustomAllegiance?: boolean;
}

export interface RemoveMemberParams {
  campaignId: string;
  memberId?: string;
  userId: string;
  memberIndex?: number;
}

export interface RemoveGangParams {
  campaignId: string;
  gangId: string;
  memberId?: string;
  memberIndex?: number;
  campaignGangId?: string;
}

export interface UpdateMemberRoleParams {
  campaignId: string;
  userId: string;
  newRole: 'OWNER' | 'ARBITRATOR' | 'MEMBER';
  previousRole: 'OWNER' | 'ARBITRATOR' | 'MEMBER';
}

export interface AddMemberToCampaignParams {
  campaignId: string;
  userId: string;
  role: 'OWNER' | 'ARBITRATOR' | 'MEMBER';
  invitedBy: string;
}

/**
 * Add a gang to a campaign with targeted cache invalidation
 */
export async function addGangToCampaign(params: AddGangToCampaignParams) {
  try {
    const supabase = await createClient();

    // Authenticate user
    const user = await getAuthenticatedUser(supabase);
    const { campaignId, gangId, userId, campaignMemberId, allegianceId, isCustomAllegiance } = params;

    let targetMemberId = campaignMemberId;
    let insertedCampaignGangId: string | null = null;
    const now = new Date().toISOString();

    // Prepare allegiance fields
    const allegianceData: any = {};
    if (allegianceId) {
      if (isCustomAllegiance) {
        allegianceData.campaign_allegiance_id = allegianceId;
        allegianceData.campaign_type_allegiance_id = null;
      } else {
        allegianceData.campaign_type_allegiance_id = allegianceId;
        allegianceData.campaign_allegiance_id = null;
      }
    }

    if (campaignMemberId) {
      const { data: insertedData, error } = await supabase
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
        })
        .select('id')
        .single();

      if (error) throw error;
      insertedCampaignGangId = insertedData?.id || null;
    } else {
      const { data: memberEntries, error: fetchError } = await supabase
        .from('campaign_members')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('user_id', userId);

      if (fetchError) throw fetchError;

      if (!memberEntries || memberEntries.length === 0) {
        throw new Error('Campaign member not found');
      }

      targetMemberId = memberEntries[0].id;

      const { data: insertedData, error } = await supabase
        .from('campaign_gangs')
        .insert({
          campaign_id: campaignId,
          gang_id: gangId,
          user_id: userId,
          campaign_member_id: targetMemberId,
          status: 'ACCEPTED',
          invited_at: now,
          joined_at: now,
          invited_by: user.id,
          ...allegianceData
        })
        .select('id')
        .single();

      if (error) throw error;
      insertedCampaignGangId = insertedData?.id || null;
    }

    try {
      const [
        { data: gangData, error: gangError },
        { data: campaignData, error: campaignError },
        { data: userData, error: userError }
      ] = await Promise.all([
        supabase.from('gangs').select('name').eq('id', gangId).single(),
        supabase.from('campaigns').select('campaign_name').eq('id', campaignId).single(),
        supabase.from('profiles').select('username').eq('id', userId).single()
      ]);
            
      if (gangError) console.error('Error fetching gang data:', gangError);
      if (campaignError) console.error('Error fetching campaign data:', campaignError);
      if (userError) console.error('Error fetching user data:', userError);
      
      if (gangData && campaignData && userData) {
        await logGangJoinedCampaign({
          gang_id: gangId,
          gang_name: gangData.name,
          campaign_name: campaignData.campaign_name,
          user_name: userData.username || 'Unknown User'
        });
      }
    } catch (logError) {
      console.error('Error logging gang joined campaign:', logError);
      // Don't fail the main operation if logging fails
    }
    

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

    return { success: true, data: { id: insertedCampaignGangId } };
  } catch (error) {
    console.error('Error adding gang to campaign:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add gang to campaign'
    };
  }
}

/**
 * Remove a member from a campaign with targeted cache invalidation
 */
export async function removeMemberFromCampaign(params: RemoveMemberParams) {
  try {
    const supabase = await createClient();
    
    // Authenticate user
    await getAuthenticatedUser(supabase);
    const { campaignId, memberId, userId, memberIndex } = params;

    let targetMemberId = memberId;

    if (!targetMemberId && typeof memberIndex === 'number') {
      const { data: memberEntries, error: fetchError } = await supabase
        .from('campaign_members')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('user_id', userId);

      if (fetchError) throw fetchError;
      
      if (!memberEntries || memberEntries.length <= memberIndex) {
        throw new Error(`Cannot find member at index ${memberIndex}`);
      }

      targetMemberId = memberEntries[memberIndex].id;
    }

    if (!targetMemberId) {
      throw new Error('Cannot identify member to remove');
    }

    // Get gangs associated with this member for cascade cleanup
    const { data: memberGangs, error: memberGangsError } = await supabase
      .from('campaign_gangs')
      .select('gang_id')
      .eq('campaign_id', campaignId)
      .eq('campaign_member_id', targetMemberId);

    if (memberGangsError) throw memberGangsError;

    if (memberGangs && memberGangs.length > 0) {
      const gangIds = memberGangs.map(g => g.gang_id);

      // Run territory update and gang deletion in parallel for better performance
      const [territoryResult, gangResult] = await Promise.all([
        supabase
          .from('campaign_territories')
          .update({ gang_id: null })
          .eq('campaign_id', campaignId)
          .in('gang_id', gangIds),
        supabase
          .from('campaign_gangs')
          .delete()
          .eq('campaign_id', campaignId)
          .eq('campaign_member_id', targetMemberId)
      ]);

      if (territoryResult.error) throw territoryResult.error;
      if (gangResult.error) throw gangResult.error;
    }

    // Cleanup any custom_shared records for this user in this campaign
    await supabase
      .from('custom_shared')
      .delete()
      .eq('user_id', userId)
      .eq('campaign_id', campaignId);

    // Finally delete the campaign member
    const { error } = await supabase
      .from('campaign_members')
      .delete()
      .eq('id', targetMemberId);

    if (error) throw error;

    // Use granular campaign membership invalidation for each affected gang
    if (memberGangs && memberGangs.length > 0) {
      memberGangs.forEach(gang => {
        invalidateCampaignMembership({
          campaignId: campaignId,
          gangId: gang.gang_id,
          userId: userId,
          action: 'leave'
        });
      });
    } else {
      // If no specific gangs, still invalidate campaign data
      revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_MEMBERS(campaignId));
      revalidateTag(CACHE_TAGS.COMPOSITE_CAMPAIGN_OVERVIEW(campaignId));
    }

    return { success: true };
  } catch (error) {
    console.error('Error removing member from campaign:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to remove member from campaign' 
    };
  }
}

/**
 * Remove a gang from a campaign with targeted cache invalidation
 */
export async function removeGangFromCampaign(params: RemoveGangParams) {
  try {
    const supabase = await createClient();
    
    // Authenticate user
    await getAuthenticatedUser(supabase);
    const { campaignId, gangId, memberId, memberIndex, campaignGangId } = params;

    // First, update any territories controlled by this gang
    const { error: territoryError } = await supabase
      .from('campaign_territories')
      .update({ gang_id: null })
      .eq('campaign_id', campaignId)
      .eq('gang_id', gangId);
      
    if (territoryError) throw territoryError;

    // Remove the gang from the campaign
    if (campaignGangId) {
      const { error } = await supabase
        .from('campaign_gangs')
        .delete()
        .eq('id', campaignGangId);
      
      if (error) throw error;
    } else if (memberId && typeof memberIndex === 'number') {
      const { data: memberEntries, error: fetchMemberError } = await supabase
        .from('campaign_members')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('user_id', memberId);
      
      if (fetchMemberError) throw fetchMemberError;
      
      if (memberEntries && memberEntries.length > memberIndex) {
        const targetMemberId = memberEntries[memberIndex].id;
        
        const { error } = await supabase
          .from('campaign_gangs')
          .delete()
          .eq('campaign_id', campaignId)
          .eq('gang_id', gangId)
          .eq('campaign_member_id', targetMemberId);
          
        if (error) throw error;
      } else {
        throw new Error(`Cannot find member at index ${memberIndex}`);
      }
    } else {
      // Fallback: remove all instances of this gang from the campaign
      const { error } = await supabase
        .from('campaign_gangs')
        .delete()
        .eq('campaign_id', campaignId)
        .eq('gang_id', gangId);

      if (error) throw error;
    }
    try {
      const [
        { data: gangData, error: gangError },
        { data: campaignData, error: campaignError }
      ] = await Promise.all([
        supabase.from('gangs').select('name').eq('id', gangId).single(),
        supabase.from('campaigns').select('campaign_name').eq('id', campaignId).single()
      ]);

      if (gangError) console.error('Error fetching gang data:', gangError);
      if (campaignError) console.error('Error fetching campaign data:', campaignError);

      // Get current user for logging
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userData, error: userError } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', user.id)
          .single();

        if (userError) console.error('Error fetching user data:', userError);

        if (gangData && campaignData && userData) {
          await logGangLeftCampaign({
            gang_id: gangId,
            gang_name: gangData.name,
            campaign_name: campaignData.campaign_name,
            user_name: userData.username || 'Unknown User'
          });
        }
      }
    } catch (logError) {
      console.error('Error logging gang leave campaign:', logError);
      // Don't fail the main operation if logging fails
    }

    // Get gang owner for proper cache invalidation
    const { data: gangData } = await supabase
      .from('gangs')
      .select('user_id')
      .eq('id', gangId)
      .single();
    
    // Use granular campaign membership invalidation
    invalidateCampaignMembership({
      campaignId: campaignId,
      gangId: gangId,
      userId: gangData?.user_id || 'unknown',
      action: 'leave'
    });

    // Invalidate permission cache
    if (gangData?.user_id) {
      invalidateGangPermissionsForUser({
        userId: gangData.user_id,
        gangId: gangId
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error removing gang from campaign:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to remove gang from campaign' 
    };
  }
}

/**
 * Add a member to a campaign with targeted cache invalidation
 */
export async function addMemberToCampaign(params: AddMemberToCampaignParams) {
  try {
    const supabase = await createClient();
    
    // Authenticate user
    await getAuthenticatedUser(supabase);
    const { campaignId, userId, role, invitedBy } = params;

    // Check if the user already exists in the campaign
    const { data: existingMembers, error: existingError } = await supabase
      .from('campaign_members')
      .select('role')
      .eq('campaign_id', campaignId)
      .eq('user_id', userId);

    if (existingError) throw existingError;

    // Use the existing role if found, otherwise use the provided role
    const finalRole = existingMembers && existingMembers.length > 0
      ? existingMembers[0].role
      : role;

    const { data, error } = await supabase
      .from('campaign_members')
      .insert({
        campaign_id: campaignId,
        user_id: userId,
        role: finalRole,
        invited_at: new Date().toISOString(),
        invited_by: invitedBy
      })
      .select()
      .single();

    if (error) throw error;

    // Use targeted cache invalidation for member addition
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_MEMBERS(campaignId));
    revalidateTag(CACHE_TAGS.COMPOSITE_CAMPAIGN_OVERVIEW(campaignId));

    return { success: true, data };
  } catch (error) {
    console.error('Error adding member to campaign:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to add member to campaign' 
    };
  }
}

/**
 * Update a member's role in a campaign with targeted cache invalidation
 */
export async function updateMemberRole(params: UpdateMemberRoleParams) {
  try {
    const supabase = await createClient();

    // Authenticate user
    await getAuthenticatedUser(supabase);
    const { campaignId, userId, newRole, previousRole } = params;

    const { error } = await supabase
      .from('campaign_members')
      .update({ role: newRole })
      .eq('campaign_id', campaignId)
      .eq('user_id', userId);

    if (error) throw error;

    // If demoting from ARBITRATOR/OWNER to MEMBER, cleanup their custom_shared records
    if ((previousRole === 'ARBITRATOR' || previousRole === 'OWNER') && newRole === 'MEMBER') {
      await supabase
        .from('custom_shared')
        .delete()
        .eq('user_id', userId)
        .eq('campaign_id', campaignId);
    }

    // Get ALL gangs in this campaign (not just the user's gangs)
    // When a user becomes ARBITRATOR/OWNER, they gain permissions on all campaign gangs
    const { data: allCampaignGangs } = await supabase
      .from('campaign_gangs')
      .select('gang_id')
      .eq('campaign_id', campaignId);

    // Invalidate permission caches for the promoted/demoted user across ALL gangs in the campaign
    if (allCampaignGangs && allCampaignGangs.length > 0) {
      allCampaignGangs.forEach(gang => {
        invalidateGangPermissionsForUser({
          userId: userId,  // The user whose role changed
          gangId: gang.gang_id
        });
      });
    }

    // Also use the new helper for broader invalidation
    invalidateCampaignMemberPermissions({
      campaignId,
      userId
    });

    // Use targeted cache invalidation for role update
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_MEMBERS(campaignId));
    revalidateTag(CACHE_TAGS.COMPOSITE_CAMPAIGN_OVERVIEW(campaignId));

    return { success: true };
  } catch (error) {
    console.error('Error updating member role:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update member role' 
    };
  }
}