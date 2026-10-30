'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { invalidateCampaignCore, invalidateCampaignGang, invalidateUser, invalidatePermission } from '@/utils/cache-tags';
import { createClient } from "@/utils/supabase/server";

import { getAuthenticatedUser } from '@/utils/auth';
import { checkCampaignArbitrator } from '@/utils/user-permissions';
import {
  updateGangFinancials,
  type GangFinancialUpdateOptions,
  type GangFinancialUpdateResult,
} from '@/utils/gang-rating-and-wealth';
import { isUuidArray } from '@/utils/uuid';
import { createGangLog } from '../../logs/gang-logs';
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
    await logGangJoinedCampaign({
      gang_id: gangId,
      campaign_id: campaignId,
      actor_id: campaignGang.invited_by
    });

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

/** A gang's balances after a bulk change, for the campaign page to patch in. */
export interface CampaignGangBalance {
  gangId: string;
  credits: number;
  wealth: number;
  trade_points: number;
}

type GangValues = NonNullable<GangFinancialUpdateResult['newValues']>;

interface CampaignGangChange {
  gangId: string;
  delta: Pick<GangFinancialUpdateOptions, 'creditsDelta' | 'tradePointsDelta'>;
  actionType: 'campaign_credits_granted' | 'campaign_trade_points_cleared';
  describe: (from: GangValues, to: GangValues) => string;
}

async function acceptedGangIds(supabase: SupabaseClient, campaignId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('campaign_gangs')
    .select('gang_id')
    .eq('campaign_id', campaignId)
    .eq('status', 'ACCEPTED');
  if (error) throw error;
  return (data ?? []).map((row) => row.gang_id).filter(Boolean) as string[];
}

/**
 * Applies each change with one gang log each. Gangs are independent, so one
 * failing does not stop the rest; the caller reports how many failed.
 */
async function changeCampaignGangs(supabase: SupabaseClient, changes: CampaignGangChange[]) {
  const results = await Promise.all(
    changes.map(async ({ gangId, delta, actionType, describe }) => {
      const result = await updateGangFinancials(supabase, { gangId, ...delta });
      if (!result.success || !result.oldValues || !result.newValues) return null;
      await createGangLog({
        gang_id: gangId,
        action_type: actionType,
        description: describe(result.oldValues, result.newValues),
      });
      const { credits, wealth, trade_points } = result.newValues;
      return { gangId, credits, wealth, trade_points };
    })
  );
  const balances = results.filter((balance): balance is CampaignGangBalance => balance !== null);
  return { balances, failed: changes.length - balances.length };
}

export interface UpdateCampaignCycleParams {
  campaignId: string;
  /** The cycle the modal opened with: the change applies only while it still holds. */
  fromCycle: number | null;
  cycle: number;
  phase: string | null;
  clearTradePoints: boolean;
}

/**
 * Set the campaign's cycle and phase, optionally clearing every accepted gang's
 * Trade Points in the same step.
 */
export async function updateCampaignCycle(params: UpdateCampaignCycleParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);
    const { campaignId, fromCycle, cycle, clearTradePoints } = params;
    const phase = params.phase?.trim() || null;

    if (!Number.isInteger(cycle) || cycle < 1) {
      return { success: false as const, error: 'Cycle must be a whole number of 1 or more' };
    }
    if (phase && phase.length > 50) {
      return { success: false as const, error: 'Phase must be 50 characters or less' };
    }
    if (!(await checkCampaignArbitrator(user.id, campaignId))) {
      return { success: false as const, error: 'Only the campaign arbitrators can change the cycle' };
    }

    // Matching the cycle the modal opened with makes a double submit match no
    // row, so one change never clears Trade Points twice.
    const campaign = { current_cycle: cycle, current_phase: phase, updated_at: new Date().toISOString() };
    const update = supabase.from('campaigns').update(campaign).eq('id', campaignId);
    const { data: updated, error: updateError } = await (
      fromCycle === null ? update.is('current_cycle', null) : update.eq('current_cycle', fromCycle)
    ).select('id');

    if (updateError) throw updateError;
    if (!updated || updated.length === 0) {
      return { success: false as const, error: 'The cycle has already been changed. Reload the page to see it.' };
    }
    invalidateCampaignCore(campaignId);

    let cleared = { balances: [] as CampaignGangBalance[], failed: 0 };
    if (clearTradePoints) {
      const { data: gangs, error: gangsError } = await supabase
        .from('gangs')
        .select('id, trade_points')
        .in('id', await acceptedGangIds(supabase, campaignId))
        .gt('trade_points', 0);
      if (gangsError) throw gangsError;

      cleared = await changeCampaignGangs(
        supabase,
        (gangs ?? []).map((gang) => ({
          gangId: gang.id,
          delta: { tradePointsDelta: -gang.trade_points },
          actionType: 'campaign_trade_points_cleared',
          describe: (from, to) =>
            `Trade Points cleared as the campaign moved to cycle ${cycle}. Trade Points: ${from.trade_points} → ${to.trade_points}`,
        }))
      );
    }

    return { success: true as const, campaign, ...cleared };
  } catch (error) {
    console.error('Error updating campaign cycle:', error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Failed to update the campaign cycle'
    };
  }
}

export interface GrantCampaignCreditsParams {
  campaignId: string;
  gangIds: string[];
  amount: number;
}

/** Give each listed gang in the campaign the same number of credits. */
export async function grantCampaignCredits(params: GrantCampaignCreditsParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);
    const { campaignId, gangIds, amount } = params;

    if (!Number.isInteger(amount) || amount < 1) {
      return { success: false as const, error: 'Credits must be a whole number of 1 or more' };
    }
    if (!isUuidArray(gangIds) || gangIds.length === 0) {
      return { success: false as const, error: 'Pick at least one gang' };
    }
    if (!(await checkCampaignArbitrator(user.id, campaignId))) {
      return { success: false as const, error: 'Only the campaign arbitrators can grant credits' };
    }

    const accepted = new Set(await acceptedGangIds(supabase, campaignId));
    if (gangIds.some((gangId) => !accepted.has(gangId))) {
      return { success: false as const, error: 'Every gang must be in this campaign' };
    }

    const granted = await changeCampaignGangs(
      supabase,
      [...new Set(gangIds)].map((gangId) => ({
        gangId,
        delta: { creditsDelta: amount },
        actionType: 'campaign_credits_granted',
        describe: (from, to) =>
          `An arbitrator granted ${amount} credits. Credits: ${from.credits} → ${to.credits}`,
      }))
    );

    return { success: true as const, ...granted };
  } catch (error) {
    console.error('Error granting campaign credits:', error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Failed to grant credits'
    };
  }
}
