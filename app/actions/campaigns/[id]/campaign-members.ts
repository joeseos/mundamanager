'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { CACHE_TAGS } from "@/utils/cache-tags";
import { logGangJoinedCampaign, logGangLeftCampaign } from "../../logs/gang-campaign-logs";

export interface AddGangToCampaignParams {
  campaignId: string;
  gangId: string;
  userId: string;
  campaignMemberId?: string;
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
    const { campaignId, gangId, userId, campaignMemberId } = params;
    
    let targetMemberId = campaignMemberId;

    if (campaignMemberId) {
      const { error } = await supabase
        .from('campaign_gangs')
        .insert({
          campaign_id: campaignId,
          gang_id: gangId,
          user_id: userId,
          campaign_member_id: campaignMemberId
        });

      if (error) throw error;
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
      
      const { error } = await supabase
        .from('campaign_gangs')
        .insert({
          campaign_id: campaignId,
          gang_id: gangId,
          user_id: userId,
          campaign_member_id: targetMemberId
        });

      if (error) throw error;
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
    

    // 🎯 TARGETED CACHE INVALIDATION
    // Invalidate only the affected campaign's caches
    revalidateTag(`campaign-members-${campaignId}`);
    revalidateTag(`campaign-territories-${campaignId}`); // Gang assignments affect territories
    revalidateTag(`campaign-battles-${campaignId}`); // Gang additions may affect battle history
    // Also invalidate the general campaign cache for this specific campaign
    revalidateTag(`campaign-${campaignId}`);
    
    // Invalidate gang cache to update campaign membership display
    revalidateTag(CACHE_TAGS.GANG_OVERVIEW(gangId));
    revalidateTag(`gang-details-${gangId}`);
    revalidatePath(`/gang/${gangId}`);

    return { success: true };
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
      
      // Clear gang_id from territories for this member's gangs
      const { error: territoryError } = await supabase
        .from('campaign_territories')
        .update({ gang_id: null })
        .eq('campaign_id', campaignId)
        .in('gang_id', gangIds);
        
      if (territoryError) throw territoryError;
      
      // Delete the campaign gangs for this member
      const { error: gangError } = await supabase
        .from('campaign_gangs')
        .delete()
        .eq('campaign_id', campaignId)
        .eq('campaign_member_id', targetMemberId);
        
      if (gangError) throw gangError;
    }

    // Finally delete the campaign member
    const { error } = await supabase
      .from('campaign_members')
      .delete()
      .eq('id', targetMemberId);

    if (error) throw error;

    // 🎯 TARGETED CACHE INVALIDATION
    // Invalidate only the affected campaign's caches
    revalidateTag(`campaign-members-${campaignId}`);
    revalidateTag(`campaign-territories-${campaignId}`); // Member removal affects territories
    revalidateTag(`campaign-battles-${campaignId}`); // Member removal may affect battle history
    // Also invalidate the general campaign cache for this specific campaign
    revalidateTag(`campaign-${campaignId}`);
    
    // Invalidate gang caches for all affected gangs to update campaign membership display
    if (memberGangs && memberGangs.length > 0) {
      memberGangs.forEach(gang => {
        revalidateTag(CACHE_TAGS.GANG_OVERVIEW(gang.gang_id));
        revalidateTag(`gang-details-${gang.gang_id}`);
        revalidatePath(`/gang/${gang.gang_id}`);
      });
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

    // 🎯 TARGETED CACHE INVALIDATION
    // Invalidate only the affected campaign's caches
    revalidateTag(`campaign-members-${campaignId}`);
    revalidateTag(`campaign-territories-${campaignId}`); // Gang removal affects territories
    revalidateTag(`campaign-battles-${campaignId}`); // Gang removal may affect battle history
    // Also invalidate the general campaign cache for this specific campaign
    revalidateTag(`campaign-${campaignId}`);
    
    // Invalidate gang cache to update campaign membership display
    revalidateTag(CACHE_TAGS.GANG_OVERVIEW(gangId));
    revalidateTag(`gang-details-${gangId}`);
    revalidatePath(`/gang/${gangId}`);

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

    // 🎯 TARGETED CACHE INVALIDATION
    // Invalidate only the affected campaign's members cache
    revalidateTag(`campaign-members-${campaignId}`);
    // Also invalidate the general campaign cache for this specific campaign
    revalidateTag(`campaign-${campaignId}`);

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
    const { campaignId, userId, newRole } = params;

    const { error } = await supabase
      .from('campaign_members')
      .update({ role: newRole })
      .eq('campaign_id', campaignId)
      .eq('user_id', userId);

    if (error) throw error;

    // 🎯 TARGETED CACHE INVALIDATION
    // Invalidate only the affected campaign's members cache
    revalidateTag(`campaign-members-${campaignId}`);
    // Also invalidate the general campaign cache for this specific campaign
    revalidateTag(`campaign-${campaignId}`);

    return { success: true };
  } catch (error) {
    console.error('Error updating member role:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update member role' 
    };
  }
}