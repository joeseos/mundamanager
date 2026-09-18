'use server';

import { invalidateCampaignGang, invalidateUser, invalidatePermission } from '@/utils/cache-tags';
import { createClient } from "@/utils/supabase/server";

import { getAuthenticatedUser } from '@/utils/auth';
import { logGangJoinedCampaign } from '../../logs/gang-campaign-logs';

export interface AcceptGangInviteParams {
  campaignId: string;
  gangId: string;
}

export interface DeclineGangInviteParams {
  campaignId: string;
  gangId: string;
}

/**
 * Accept a gang invite - changes status from PENDING to ACCEPTED
 * Only the gang owner can accept
 */
export async function acceptGangInvite(params: AcceptGangInviteParams) {
  try {
    const supabase = await createClient();

    // Authenticate user - must be the gang owner
    const user = await getAuthenticatedUser(supabase);
    const { campaignId, gangId } = params;

    // Verify the user owns this gang
    const { data: gangData, error: gangError } = await supabase
      .from('gangs')
      .select('user_id, name')
      .eq('id', gangId)
      .single();

    if (gangError) throw gangError;
    if (!gangData) throw new Error('Gang not found');
    if (gangData.user_id !== user.id) {
      throw new Error('Only the gang owner can accept this invitation');
    }

    // Find the PENDING campaign_gang record
    const { data: campaignGang, error: fetchError } = await supabase
      .from('campaign_gangs')
      .select('id, invited_by')
      .eq('campaign_id', campaignId)
      .eq('gang_id', gangId)
      .eq('status', 'PENDING')
      .single();

    if (fetchError) throw fetchError;
    if (!campaignGang) throw new Error('No pending invitation found');

    const now = new Date().toISOString();
    // Zero rows matched is not an error, so a lost race or an RLS denial would
    // otherwise report success — and bust caches — while the row stayed PENDING.
    const { data: accepted, error: updateError } = await supabase
      .from('campaign_gangs')
      .update({
        status: 'ACCEPTED',
        joined_at: now
      })
      .eq('id', campaignGang.id)
      .eq('status', 'PENDING')
      .select('id');

    if (updateError) throw updateError;
    if (!accepted || accepted.length === 0) {
      return { success: false, error: 'This invitation has already been answered' };
    }

    // Logged here, not at invite time: while PENDING only the gang owner passes the gang_logs policy.
    try {
      const [
        { data: campaignData, error: campaignError },
        { data: inviterData, error: inviterError }
      ] = await Promise.all([
        supabase.from('campaigns').select('campaign_name').eq('id', campaignId).maybeSingle(),
        campaignGang.invited_by
          ? supabase.from('profiles').select('username').eq('id', campaignGang.invited_by).maybeSingle()
          : Promise.resolve({ data: null as { username: string | null } | null, error: null })
      ]);

      if (campaignError) console.error('Error fetching campaign data:', campaignError);
      if (inviterError) console.error('Error fetching inviter data:', inviterError);

      if (campaignData) {
        await logGangJoinedCampaign({
          gang_id: gangId,
          gang_name: gangData.name,
          campaign_name: campaignData.campaign_name,
          user_name: inviterData?.username || 'Unknown User'
        });
      }
    } catch (logError) {
      console.error('Error logging gang joined campaign:', logError);
      // Don't fail the main operation if logging fails
    }

    // Invalidate caches
    invalidateCampaignGang(campaignId, gangId);
    invalidatePermission(user.id, gangId);
    invalidateUser(user.id);

    // Also invalidate permissions for all campaign arbitrators (OWNER/ARBITRATOR)
    // They now have edit rights for this gang since it's ACCEPTED
    const { data: campaignArbitrators } = await supabase
      .from('campaign_members')
      .select('user_id')
      .eq('campaign_id', campaignId)
      .in('role', ['OWNER', 'ARBITRATOR']);

    if (campaignArbitrators) {
      for (const arbitrator of campaignArbitrators) {
        // Skip gang owner - already invalidated above
        if (arbitrator.user_id !== user.id) {
          invalidatePermission(arbitrator.user_id, gangId);
          invalidateUser(arbitrator.user_id);
        }
      }
    }

    return {
      success: true,
      message: `Accepted invitation for ${gangData.name}`
    };
  } catch (error) {
    console.error('Error accepting gang invite:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to accept gang invitation'
    };
  }
}

/**
 * Decline a gang invite - removes the PENDING campaign_gang record
 * Only the gang owner can decline
 */
export async function declineGangInvite(params: DeclineGangInviteParams) {
  try {
    const supabase = await createClient();

    // Authenticate user - must be the gang owner
    const user = await getAuthenticatedUser(supabase);
    const { campaignId, gangId } = params;

    // Verify the user owns this gang
    const { data: gangData, error: gangError } = await supabase
      .from('gangs')
      .select('user_id, name')
      .eq('id', gangId)
      .single();

    if (gangError) throw gangError;
    if (!gangData) throw new Error('Gang not found');
    if (gangData.user_id !== user.id) {
      throw new Error('Only the gang owner can decline this invitation');
    }

    // Find and delete the PENDING campaign_gang record. The DELETE policy admits
    // admins, campaign arbitrators, and MEMBER-role owners of the gang — anyone
    // else matches no rows and gets no error, so count what was removed.
    const { data: declined, error: deleteError } = await supabase
      .from('campaign_gangs')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('gang_id', gangId)
      .eq('status', 'PENDING')
      .select('id');

    if (deleteError) throw deleteError;
    if (!declined || declined.length === 0) {
      return { success: false, error: 'This invitation has already been answered' };
    }

    // Invalidate caches
    invalidateCampaignGang(campaignId, gangId);
    invalidateUser(user.id);

    return {
      success: true,
      message: `Declined invitation for ${gangData.name}`
    };
  } catch (error) {
    console.error('Error declining gang invite:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to decline gang invitation'
    };
  }
}
