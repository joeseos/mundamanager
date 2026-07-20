'use server';

import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/utils/cache-tags";
import { getAuthenticatedUser } from '@/utils/auth';
import { checkCampaignArbitrator } from '@/utils/user-permissions';

export interface JoinRequestParams {
  campaignId: string;
}

export interface ResolveJoinRequestParams {
  campaignId: string;
  userId: string;
}

/**
 * Remove every arbitrator's notification for a handled/withdrawn join request.
 * The fan-out trigger creates one notification per OWNER/ARBITRATOR, so when one
 * of them (or the requester) resolves the request the others' copies go stale.
 * Notifications RLS is receiver-scoped, hence the service role client.
 * Best-effort: a failure here never fails the main operation.
 */
async function cleanupJoinRequestNotifications(campaignId: string, requesterId: string) {
  try {
    const serviceClient = createServiceRoleClient();
    await serviceClient
      .from('notifications')
      .delete()
      .eq('type', 'campaign_join_request')
      .eq('sender_id', requesterId)
      .eq('link', `https://www.mundamanager.com/campaigns/${campaignId}`);
  } catch (error) {
    console.error('Error cleaning up join request notifications:', error);
  }
}

/**
 * Request to join a campaign. RLS enforces the real conditions: self-insert only,
 * campaign has allow_join_requests enabled, and the requester is not already a
 * member. The OWNER/ARBITRATOR notification fan-out happens via DB trigger.
 */
export async function requestToJoinCampaign(params: JoinRequestParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { error } = await supabase
      .from('campaign_join_requests')
      .insert({
        campaign_id: params.campaignId,
        user_id: user.id
      });

    if (error) {
      // Unique violation: a request is already pending — treat as success
      if (error.code === '23505') {
        return { success: true };
      }
      // RLS rejection: flag disabled or requester is already a member
      if (error.code === '42501') {
        return {
          success: false,
          error: 'Join requests are not enabled for this campaign, or you are already a member.'
        };
      }
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('Error requesting to join campaign:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to request to join campaign'
    };
  }
}

/**
 * Withdraw the current user's own pending join request. Idempotent: succeeds
 * even if the request was already handled or withdrawn.
 */
export async function withdrawJoinRequest(params: JoinRequestParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { error } = await supabase
      .from('campaign_join_requests')
      .delete()
      .eq('campaign_id', params.campaignId)
      .eq('user_id', user.id);

    if (error) throw error;

    await cleanupJoinRequestNotifications(params.campaignId, user.id);

    return { success: true };
  } catch (error) {
    console.error('Error withdrawing join request:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to withdraw join request'
    };
  }
}

/**
 * Accept a pending join request (OWNER/ARBITRATOR only): add the requester as a
 * MEMBER and remove the request. Graceful when another arbitrator already
 * handled the same request.
 */
export async function acceptJoinRequest(params: ResolveJoinRequestParams) {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);
    const { campaignId, userId } = params;

    // Authorize, add the member (skipping if already one), delete the request, and
    // clear the arbitrators' notifications — all in one SECURITY DEFINER transaction.
    // The request row is locked FOR UPDATE, so concurrent accepts can't create
    // duplicate members, and a mid-way failure rolls back cleanly (no request to
    // restore by hand). See supabase/functions/accept_campaign_join_request.sql.
    const { data: outcome, error } = await supabase.rpc('accept_campaign_join_request', {
      p_campaign_id: campaignId,
      p_user_id: userId,
    });

    if (error) throw error;

    if (outcome === 'not_authorized') {
      return { success: false, error: 'Only campaign owners and arbitrators can accept join requests' };
    }

    // Only 'accepted' actually changed membership; refresh the member/overview
    // caches and the requester's own campaign list. 'already_member'/'no_request'
    // touched no membership state.
    if (outcome === 'accepted') {
      revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_MEMBERS(campaignId), { expire: 0 });
      revalidateTag(CACHE_TAGS.COMPOSITE_CAMPAIGN_OVERVIEW(campaignId), { expire: 0 });
      revalidateTag(CACHE_TAGS.USER_CAMPAIGNS(userId), { expire: 0 });
    }

    return { success: true };
  } catch (error) {
    console.error('Error accepting join request:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to accept join request'
    };
  }
}

/**
 * Decline a pending join request (OWNER/ARBITRATOR only). Idempotent: succeeds
 * even if the request was already handled or withdrawn.
 */
export async function declineJoinRequest(params: ResolveJoinRequestParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);
    const { campaignId, userId } = params;

    const isArbitrator = await checkCampaignArbitrator(user.id, campaignId);
    if (!isArbitrator) {
      return { success: false, error: 'Only campaign owners and arbitrators can decline join requests' };
    }

    const { error } = await supabase
      .from('campaign_join_requests')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('user_id', userId);

    if (error) throw error;

    await cleanupJoinRequestNotifications(campaignId, userId);

    return { success: true };
  } catch (error) {
    console.error('Error declining join request:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to decline join request'
    };
  }
}
