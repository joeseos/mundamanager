'use server';

import { createClient, createServiceRoleClient } from "@/utils/supabase/server";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/utils/cache-tags";
import { getAuthenticatedUser } from '@/utils/auth';
import { checkCampaignArbitrator } from '@/utils/user-permissions';
import { addMemberToCampaign } from './campaign-members';

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
    const user = await getAuthenticatedUser(supabase);
    const { campaignId, userId } = params;

    const isArbitrator = await checkCampaignArbitrator(user.id, campaignId);
    if (!isArbitrator) {
      return { success: false, error: 'Only campaign owners and arbitrators can accept join requests' };
    }

    // Atomically claim the request by deleting it. campaign_join_requests has a
    // UNIQUE (campaign_id, user_id) constraint and each PostgREST call runs in its
    // own transaction, so of two concurrent accepts exactly one deletes the row and
    // gets it back via RETURNING; the other (and any already withdrawn/declined
    // request) deletes nothing. Only the winner adds the member. This closes the
    // check-then-act race that would otherwise create duplicate campaign_members
    // rows — that table has no unique constraint on (campaign_id, user_id), and
    // addMemberToCampaign inserts unconditionally.
    const { data: claimed, error: claimError } = await supabase
      .from('campaign_join_requests')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('user_id', userId)
      .select('id');

    if (claimError) throw claimError;

    // Lost the race, or the request was already withdrawn/declined/handled.
    if (!claimed || claimed.length === 0) {
      await cleanupJoinRequestNotifications(campaignId, userId);
      return { success: true };
    }

    // We own the claim. Skip the insert if the user was already added by another
    // path (e.g. a direct invite) between requesting and now — addMemberToCampaign
    // is not idempotent, so guarding here avoids a duplicate row.
    const { data: existingMembers, error: memberError } = await supabase
      .from('campaign_members')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('user_id', userId)
      .limit(1);

    if (memberError) throw memberError;

    if (!existingMembers || existingMembers.length === 0) {
      // Fires notify_campaign_member_added (acceptance notice to the requester)
      // and invalidates the campaign member/overview caches.
      const addResult = await addMemberToCampaign({
        campaignId,
        userId,
        role: 'MEMBER',
        invitedBy: user.id
      });

      if (!addResult.success) {
        // addMemberToCampaign failed (a transient error — the arbitrator check and
        // the campaign_members RLS both already passed). Restore the claimed request
        // so it isn't silently dropped and an arbitrator can retry. This must use the
        // service-role client: the row's user_id is the requester, not the acting
        // arbitrator, so the self-insert RLS policy (user_id = auth.uid()) would
        // reject a normal insert. Clear the original notifications first so the
        // restore's fan-out trigger produces exactly one notification (and one email)
        // per arbitrator instead of stacking a duplicate set on top of the originals.
        await cleanupJoinRequestNotifications(campaignId, userId);
        const serviceClient = createServiceRoleClient();
        const { error: restoreError } = await serviceClient
          .from('campaign_join_requests')
          .insert({ campaign_id: campaignId, user_id: userId });
        if (restoreError) {
          // A UNIQUE violation just means the requester already re-requested, so an
          // active request exists anyway — the desired end state still holds.
          console.error('Error restoring join request after failed accept:', restoreError);
        }
        return { success: false, error: addResult.error };
      }
    }

    await cleanupJoinRequestNotifications(campaignId, userId);

    // The requester's own campaign list now includes this campaign
    revalidateTag(CACHE_TAGS.USER_CAMPAIGNS(userId), { expire: 0 });

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
