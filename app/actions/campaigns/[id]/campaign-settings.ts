'use server';

import { invalidateGang, invalidateGangCampaignMembership, invalidateCampaign, invalidateUser, invalidateCampaignCount } from '@/utils/cache-tags';
import { createClient } from "@/utils/supabase/server";

import { getAuthenticatedUser } from '@/utils/auth';

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
      custom_trading_posts
    } = params;

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

    const { error } = await supabase
      .from('campaigns')
      .update(updateData)
      .eq('id', campaignId);

    if (error) throw error;

    // Get all gangs in this campaign to invalidate their caches
    const { data: campaignGangs } = await supabase
      .from('campaign_gangs')
      .select('gang_id')
      .eq('campaign_id', campaignId);

    // Use granular cache invalidation with proper taxonomy
    invalidateCampaign(campaignId);
    invalidateCampaign(campaignId);
    
    // Invalidate gang caches to update campaign resource settings display
    if (campaignGangs && campaignGangs.length > 0) {
      campaignGangs.forEach(gang => {
        // Gang pages show campaign info (name, settings), so invalidate gang campaign cache
        invalidateGangCampaignMembership(gang.gang_id);
        // NOTE: No need to invalidate COMPOSITE_GANG_FIGHTERS_LIST - campaign changes don't affect fighter data
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating campaign settings:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update campaign settings' 
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
    invalidateCampaign(campaignId);
    invalidateCampaign(campaignId);
    invalidateCampaign(campaignId);
    invalidateCampaign(campaignId);
    invalidateCampaign(campaignId);

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