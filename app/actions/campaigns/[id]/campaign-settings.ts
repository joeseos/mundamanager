'use server';

import { invalidateGang, invalidateGangCampaignMembership, invalidateCampaignCore, invalidateCampaignAll, invalidateUser, invalidateCampaignCount } from '@/utils/cache-tags';
import { createClient } from "@/utils/supabase/server";

import { getAuthenticatedUser } from '@/utils/auth';
import { checkCampaignArbitrator } from '@/utils/user-permissions';
import { updateGangFinancials } from '@/utils/gang-rating-and-wealth';
import { isUuidArray } from '@/utils/uuid';
import { createGangLog } from '../../logs/gang-logs';
import { formatFinancialChanges } from '../../logs/log-helpers';

export interface UpdateCampaignSettingsParams {
  campaignId: string;
  campaign_name?: string;
  description?: string;
  trading_posts?: string[];
  note?: string;
  status?: string;
  discord_guild_id?: string | null;
  discord_channel_id?: string | null;
  discord_channel_type?: number | null;
  custom_trading_posts?: string[];
  allow_join_requests?: boolean;
}

/**
 * Update campaign settings with targeted cache invalidation
 */
export async function updateCampaignSettings(params: UpdateCampaignSettingsParams) {
  try {
    const supabase = await createClient();
    
    // Authenticate user
    await getAuthenticatedUser(supabase);
    const {
      campaignId,
      campaign_name,
      description,
      trading_posts,
      note,
      status,
      discord_guild_id,
      discord_channel_id,
      discord_channel_type,
      custom_trading_posts,
      allow_join_requests
    } = params;

    if ([trading_posts, custom_trading_posts].some((ids) => ids !== undefined && !isUuidArray(ids))) {
      return { success: false, error: 'Invalid trading posts' };
    }

    // Only include provided fields in the update
    const updateData: any = { updated_at: new Date().toISOString() };
    if (campaign_name !== undefined) updateData.campaign_name = campaign_name.trimEnd();
    if (description !== undefined) updateData.description = description;
    if (trading_posts !== undefined) updateData.trading_posts = trading_posts;
    if (custom_trading_posts !== undefined) updateData.custom_trading_posts = custom_trading_posts;
    if (note !== undefined) updateData.note = note;
    if (status !== undefined) updateData.status = status;
    if (discord_guild_id !== undefined) updateData.discord_guild_id = discord_guild_id;
    if (discord_channel_id !== undefined) updateData.discord_channel_id = discord_channel_id;
    if (discord_channel_type !== undefined) updateData.discord_channel_type = discord_channel_type;
    if (allow_join_requests !== undefined) updateData.allow_join_requests = allow_join_requests;

    const { data, error } = await supabase
      .from('campaigns')
      .update(updateData)
      .eq('id', campaignId)
      .select('campaign_name, description, status, note, trading_posts, custom_trading_posts, allow_join_requests, discord_guild_id, discord_channel_id, discord_channel_type, updated_at')
      .single();

    if (error) throw error;

    // Get all gangs in this campaign to invalidate their caches
    const { data: campaignGangs } = await supabase
      .from('campaign_gangs')
      .select('gang_id')
      .eq('campaign_id', campaignId);

    // Use granular cache invalidation with proper taxonomy
    invalidateCampaignCore(campaignId);

    // Invalidate gang caches to update campaign resource settings display
    if (campaignGangs && campaignGangs.length > 0) {
      campaignGangs.forEach(gang => {
        // Gang pages show campaign info (name, settings), so invalidate gang campaign cache
        invalidateGangCampaignMembership(gang.gang_id);
        // NOTE: No need to invalidate COMPOSITE_GANG_FIGHTERS_LIST - campaign changes don't affect fighter data
      });
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error updating campaign settings:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update campaign settings' 
    };
  }
}

export interface UpdateCampaignCycleParams {
  campaignId: string;
  /** The cycle the modal opened with: the change applies only while it still holds. */
  fromCycle: number | null;
  cycle: number;
  phase: string | null;
  clearTradePoints: boolean;
  /** Credits given to every accepted gang; 0 for none. */
  credits: number;
}

/** A gang's balances after the cycle change, for the campaign page to patch in. */
export interface CampaignGangBalance {
  gangId: string;
  wealth: number;
  trade_points: number;
}

/**
 * Set the campaign's cycle and phase and, in the same step, optionally clear
 * every accepted gang's Trade Points and grant each of them credits.
 */
export async function updateCampaignCycle(params: UpdateCampaignCycleParams) {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);
    const { campaignId, fromCycle, cycle, clearTradePoints, credits } = params;
    const phase = params.phase?.trim() || null;

    if (!Number.isInteger(cycle) || cycle < 1) {
      return { success: false as const, error: 'Cycle must be a whole number of 1 or more' };
    }
    if (phase && phase.length > 50) {
      return { success: false as const, error: 'Phase must be 50 characters or less' };
    }
    if (!Number.isInteger(credits) || credits < 0) {
      return { success: false as const, error: 'Credits must be a whole number of 0 or more' };
    }
    if (!(await checkCampaignArbitrator(user.id, campaignId))) {
      return { success: false as const, error: 'Only the campaign arbitrators can change the cycle' };
    }

    // Applies only while the cycle is still the one the modal opened with, so a
    // stale page cannot overwrite a cycle another arbitrator has changed since.
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

    if (!clearTradePoints && credits === 0) {
      return { success: true as const, campaign, balances: [] as CampaignGangBalance[], failed: 0 };
    }

    const { data: campaignGangs, error: gangsError } = await supabase
      .from('campaign_gangs')
      .select('gangs!inner(id, user_id, trade_points)')
      .eq('campaign_id', campaignId)
      .eq('status', 'ACCEPTED');
    if (gangsError) throw gangsError;

    const gangs = (campaignGangs ?? [])
      .map((row) => row.gangs as unknown as { id: string; user_id: string; trade_points: number })
      .filter((gang) => credits > 0 || gang.trade_points > 0);

    const results = await Promise.all(gangs.map(async (gang): Promise<CampaignGangBalance | null> => {
      const result = await updateGangFinancials(supabase, { gangId: gang.id, creditsDelta: credits, clearTradePoints });
      if (!result.success || !result.oldValues || !result.newValues) return null;
      const { oldValues: from, newValues: to } = result;

      // Logs go to the gang owner, as for other arbitrator edits.
      await Promise.all([
        to.trade_points !== from.trade_points && createGangLog({
          gang_id: gang.id,
          user_id: gang.user_id,
          action_type: 'campaign_trade_points_cleared',
          description: `Trade Points cleared in cycle ${cycle}. Trade Points: ${from.trade_points} → ${to.trade_points}`,
        }),
        credits > 0 && createGangLog({
          gang_id: gang.id,
          user_id: gang.user_id,
          action_type: 'campaign_credits_granted',
          description: `Granted ${credits} credits in cycle ${cycle}. ${formatFinancialChanges(from.credits, to.credits, from.rating, to.rating, from.wealth, to.wealth)}`,
        }),
      ]);
      return { gangId: gang.id, wealth: to.wealth, trade_points: to.trade_points };
    }));

    const balances = results.filter((balance) => balance !== null);
    return { success: true as const, campaign, balances, failed: gangs.length - balances.length };
  } catch (error) {
    console.error('Error updating campaign cycle:', error);
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Failed to update the campaign cycle'
    };
  }
}

/**
 * Delete a campaign with comprehensive cache invalidation
 */
export async function deleteCampaign(campaignId: string) {
  try {
    const supabase = await createClient();
    
    // Authenticate user
    const user = await getAuthenticatedUser(supabase);

    // Get all gangs in this campaign before deletion
    const { data: campaignGangs } = await supabase
      .from('campaign_gangs')
      .select('gang_id')
      .eq('campaign_id', campaignId);
    
    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', campaignId);

    if (error) throw error;

    // Clean up all images for this campaign
    try {
      // List subfolders and files directly under campaigns/{campaignId}/
      const { data: topLevelItems } = await supabase.storage
        .from('users-images')
        .list(`campaigns/${campaignId}/`);

      const filesToRemove: string[] = [];

      if (topLevelItems && topLevelItems.length > 0) {
        // Files at the top level can go straight into the removal list.
        // For each subfolder (item.id === null marks virtual folder entries),
        // list its contents in parallel rather than sequentially.
        const subfolderListings = await Promise.all(
          topLevelItems.map(async item => {
            if (!item.name) return null;
            if (item.id !== null) {
              return { type: 'file' as const, path: `campaigns/${campaignId}/${item.name}` };
            }
            const { data: subFiles } = await supabase.storage
              .from('users-images')
              .list(`campaigns/${campaignId}/${item.name}/`);
            const paths = (subFiles ?? [])
              .filter(f => f.name)
              .map(f => `campaigns/${campaignId}/${item.name}/${f.name}`);
            return { type: 'folder' as const, paths };
          })
        );

        for (const result of subfolderListings) {
          if (!result) continue;
          if (result.type === 'file') {
            filesToRemove.push(result.path);
          } else {
            filesToRemove.push(...result.paths);
          }
        }
      }

      if (filesToRemove.length > 0) {
        await supabase.storage
          .from('users-images')
          .remove(filesToRemove);
      }

      // Supabase folders are virtual; once files are gone, the folder disappears in UI
    } catch (storageError) {
      // Log the error but don't fail the campaign deletion
      console.error('Error cleaning up campaign images:', storageError);
    }

    // Use comprehensive cache invalidation with proper taxonomy for deleted campaign
    invalidateCampaignAll(campaignId);

    // Invalidate gang campaign caches since campaign was deleted
    if (campaignGangs && campaignGangs.length > 0) {
      campaignGangs.forEach(gang => {
        invalidateGangCampaignMembership(gang.gang_id);
        invalidateGang(gang.gang_id);
      });
    }

    invalidateUser(user.id);

    // Invalidate global campaign count
    invalidateCampaignCount();

    return { success: true };
  } catch (error) {
    console.error('Error deleting campaign:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to delete campaign' 
    };
  }
}