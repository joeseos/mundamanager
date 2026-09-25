'use server';

import { invalidateCampaignMembers, invalidateCampaignGang, invalidateCampaignTradingPosts, invalidateUser, invalidatePermission } from '@/utils/cache-tags';
import { createClient, createServiceRoleClient } from "@/utils/supabase/server";

import { logGangJoinedCampaign, logGangLeftCampaign } from "../../logs/gang-campaign-logs";
import { getAuthenticatedUser } from '@/utils/auth';
import { checkPermission, isArbitrator } from '@/utils/user-permissions';
import { assertGangMatchesCampaignEdition } from './assert-gang-campaign-edition';

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
    let insertedStatus: string | null = null;
    const now = new Date().toISOString();

    const editionCheck = await assertGangMatchesCampaignEdition(supabase, campaignId, gangId);
    if (!editionCheck.ok) {
      return { success: false, error: editionCheck.error };
    }

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

    // If adding your own gang, auto-accept. If adding someone else's gang, set to PENDING
    const isOwnGang = user.id === userId;

    // Prevent duplicate: one gang per campaign
    const { data: existingRows } = await supabase
      .from('campaign_gangs')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('gang_id', gangId)
      .limit(1);
    if (existingRows && existingRows.length > 0) {
      return {
        success: false,
        error: 'This gang is already in the campaign'
      };
    }

    if (campaignMemberId) {
      const { data: insertedData, error } = await supabase
        .from('campaign_gangs')
        .insert({
          campaign_id: campaignId,
          gang_id: gangId,
          user_id: userId,
          campaign_member_id: campaignMemberId,
          status: isOwnGang ? 'ACCEPTED' : 'PENDING',
          invited_at: now,
          joined_at: isOwnGang ? now : null,
          invited_by: user.id,
          ...allegianceData
        })
        .select('id, status')
        .single();

      if (error) throw error;
      insertedCampaignGangId = insertedData?.id || null;
      insertedStatus = insertedData?.status || null;
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
          status: isOwnGang ? 'ACCEPTED' : 'PENDING',
          invited_at: now,
          joined_at: isOwnGang ? now : null,
          invited_by: user.id,
          ...allegianceData
        })
        .select('id, status')
        .single();

      if (error) throw error;
      insertedCampaignGangId = insertedData?.id || null;
      insertedStatus = insertedData?.status || null;
    }

    // A PENDING invite isn't a join yet - acceptGangInvite logs it if the owner accepts.
    if (insertedStatus === 'ACCEPTED') {
      await logGangJoinedCampaign({ gang_id: gangId, campaign_id: campaignId, actor_id: userId });
    }

    // Use granular campaign membership invalidation
    invalidateCampaignGang(campaignId, gangId);
    invalidateUser(userId);
    invalidatePermission(userId, gangId);

    return {
      success: true,
      data: { id: insertedCampaignGangId, status: insertedStatus }
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
    // Use service role client to bypass RLS (owner deleting another user's shares)
    const serviceClient = createServiceRoleClient();
    const { data: removedShares } = await serviceClient
      .from('custom_shared')
      .delete()
      .eq('user_id', userId)
      .eq('campaign_id', campaignId)
      .select('id');

    // Finally delete the campaign member
    const { error } = await supabase
      .from('campaign_members')
      .delete()
      .eq('id', targetMemberId);

    if (error) throw error;

    // Only if they actually had something shared into this campaign.
    if (removedShares && removedShares.length > 0) {
      invalidateCampaignTradingPosts(campaignId);
    }

    // Use granular campaign membership invalidation for each affected gang
    if (memberGangs && memberGangs.length > 0) {
      memberGangs.forEach(gang => {
        invalidateCampaignGang(campaignId, gang.gang_id);
        invalidateUser(userId);
      });
    } else {
      // If no specific gangs, still invalidate campaign data
      invalidateCampaignMembers(campaignId);
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
    const user = await getAuthenticatedUser(supabase);
    const { campaignId, gangId, memberId, memberIndex, campaignGangId } = params;

    // Mirror the campaign_gangs DELETE policy up front: the gang_logs INSERT policy is looser,
    // so without this a denied removal would still log.
    const [permission, { data: gangData, error: gangError }] = await Promise.all([
      checkPermission(user.id, { campaignId }),
      supabase.from('gangs').select('user_id').eq('id', gangId).single()
    ]);

    if (gangError) throw gangError;

    const canRemove = isArbitrator(permission)
      || (permission.campaign_role === 'MEMBER' && gangData.user_id === user.id);
    if (!canRemove) {
      return { success: false, error: 'You do not have permission to remove this gang' };
    }

    // Log before the delete - for a non-owner the campaign_gangs row is what grants the insert.
    const statusQuery = supabase.from('campaign_gangs').select('status')
      .eq('campaign_id', campaignId)
      .eq('gang_id', gangId);
    const { data: campaignGangRows, error: campaignGangError } = await (campaignGangId
      ? statusQuery.eq('id', campaignGangId)
      : statusQuery.limit(1));

    if (campaignGangError) console.error('Error fetching campaign gang status:', campaignGangError);

    if (campaignGangRows?.[0]?.status === 'ACCEPTED') {
      await logGangLeftCampaign({ gang_id: gangId, campaign_id: campaignId, actor_id: user.id });
    }

    // Remove the gang from the campaign
    let removedGangs: { id: string }[] | null = null;

    if (campaignGangId) {
      const { data, error } = await supabase
        .from('campaign_gangs')
        .delete()
        .eq('id', campaignGangId)
        .eq('campaign_id', campaignId)
        .eq('gang_id', gangId)
        .select('id');

      if (error) throw error;
      removedGangs = data;
    } else if (memberId && typeof memberIndex === 'number') {
      const { data: memberEntries, error: fetchMemberError } = await supabase
        .from('campaign_members')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('user_id', memberId);
      
      if (fetchMemberError) throw fetchMemberError;
      
      if (memberEntries && memberEntries.length > memberIndex) {
        const targetMemberId = memberEntries[memberIndex].id;
        
        const { data, error } = await supabase
          .from('campaign_gangs')
          .delete()
          .eq('campaign_id', campaignId)
          .eq('gang_id', gangId)
          .eq('campaign_member_id', targetMemberId)
          .select('id');

        if (error) throw error;
        removedGangs = data;
      } else {
        throw new Error(`Cannot find member at index ${memberIndex}`);
      }
    } else {
      // Fallback: remove all instances of this gang from the campaign
      const { data, error } = await supabase
        .from('campaign_gangs')
        .delete()
        .eq('campaign_id', campaignId)
        .eq('gang_id', gangId)
        .select('id');

      if (error) throw error;
      removedGangs = data;
    }

    // The DELETE policy admits admins, campaign arbitrators, and MEMBER-role owners of the
    // gang - anyone else matches no rows and gets no error, so count what was removed.
    if (!removedGangs || removedGangs.length === 0) {
      return {
        success: false,
        error: 'This gang has already been removed, or you do not have permission to remove it'
      };
    }

    // After the delete, so a denied or lost removal leaves the gang's territories alone.
    const { error: territoryError } = await supabase
      .from('campaign_territories')
      .update({ gang_id: null })
      .eq('campaign_id', campaignId)
      .eq('gang_id', gangId);

    if (territoryError) throw territoryError;

    invalidateCampaignGang(campaignId, gangId);
    invalidatePermission(gangData.user_id, gangId);
    invalidateUser(gangData.user_id);

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
    invalidateCampaignMembers(campaignId);

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
    const user = await getAuthenticatedUser(supabase);
    const { campaignId, userId, newRole, previousRole } = params;

    const { error } = await supabase
      .from('campaign_members')
      .update({ role: newRole })
      .eq('campaign_id', campaignId)
      .eq('user_id', userId);

    if (error) throw error;

    // If demoting from ARBITRATOR/OWNER to MEMBER, cleanup their custom_shared records
    // Use service role client to bypass RLS (owner deleting another user's shares)
    if ((previousRole === 'ARBITRATOR' || previousRole === 'OWNER') && newRole === 'MEMBER') {
      const serviceClient = createServiceRoleClient();
      const { data: removedShares } = await serviceClient
        .from('custom_shared')
        .delete()
        .eq('user_id', userId)
        .eq('campaign_id', campaignId)
        .select('id');

      // A demotion withdraws whatever they had shared into the campaign.
      if (removedShares && removedShares.length > 0) {
        invalidateCampaignTradingPosts(campaignId);
      }
    }

    // If promoting from MEMBER to ARBITRATOR, send notification to the promoted user
    if (previousRole === 'MEMBER' && newRole === 'ARBITRATOR') {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('campaign_name')
        .eq('id', campaignId)
        .single();
      const baseUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:3000'
        : 'https://www.mundamanager.com';
      await supabase.from('notifications').insert({
        receiver_id: userId,
        sender_id: user.id,
        type: 'info',
        text: `You have been promoted to **Arbitrator** in the campaign **${campaign?.campaign_name ?? 'Unknown'}**.\n\nYou can now:\n• Edit the campaign (description, image, campaign pack)\n• Add new players and gangs\n• Edit player gangs\n• Manage Territories and Battle Logs\n• Add custom resources\n• Share your custom assets with the campaign (fighters, equipment, and more)\n\nClick the link below to go to the campaign.`,
        link: `${baseUrl}/campaigns/${campaignId}`,
        dismissed: false
      });
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
        invalidatePermission(userId, gang.gang_id);
        invalidateUser(userId);
      });
    }

    // Also use the new helper for broader invalidation
    invalidateUser(userId);

    // Use targeted cache invalidation for role update
    invalidateCampaignMembers(campaignId);

    return { success: true };
  } catch (error) {
    console.error('Error updating member role:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update member role' 
    };
  }
}