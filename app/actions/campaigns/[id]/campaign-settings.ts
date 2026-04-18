'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS, invalidateCampaignCount } from "@/utils/cache-tags";
import { getAuthenticatedUser } from '@/utils/auth';

export interface UpdateCampaignSettingsParams {
  campaignId: string;
  campaign_name?: string;
  description?: string;
  has_meat?: boolean;
  has_exploration_points?: boolean;
  has_scavenging_rolls?: boolean;
  has_power?: boolean;
  has_sustenance?: boolean;
  has_salvage?: boolean;
  trading_posts?: string[];
  note?: string;
  status?: string;
  discord_guild_id?: string | null;
  discord_channel_id?: string | null;
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
      has_meat,
      has_exploration_points,
      has_scavenging_rolls,
      has_power,
      has_sustenance,
      has_salvage,
      trading_posts,
      note,
      status,
      discord_guild_id,
      discord_channel_id
    } = params;

    // Only include provided fields in the update
    const updateData: any = { updated_at: new Date().toISOString() };
    if (campaign_name !== undefined) updateData.campaign_name = campaign_name.trimEnd();
    if (description !== undefined) updateData.description = description;
    if (has_meat !== undefined) updateData.has_meat = has_meat;
    if (has_exploration_points !== undefined) updateData.has_exploration_points = has_exploration_points;
    if (has_scavenging_rolls !== undefined) updateData.has_scavenging_rolls = has_scavenging_rolls;
    if (has_power !== undefined) updateData.has_power = has_power;
    if (has_sustenance !== undefined) updateData.has_sustenance = has_sustenance;
    if (has_salvage !== undefined) updateData.has_salvage = has_salvage;
    if (trading_posts !== undefined) updateData.trading_posts = trading_posts;
    if (note !== undefined) updateData.note = note;
    if (status !== undefined) updateData.status = status;
    if (discord_guild_id !== undefined) updateData.discord_guild_id = discord_guild_id;
    if (discord_channel_id !== undefined) updateData.discord_channel_id = discord_channel_id;

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
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_BASIC(campaignId));
    revalidateTag(CACHE_TAGS.COMPOSITE_CAMPAIGN_OVERVIEW(campaignId));
    
    // Invalidate gang caches to update campaign resource settings display
    if (campaignGangs && campaignGangs.length > 0) {
      campaignGangs.forEach(gang => {
        // Gang pages show campaign info (name, settings), so invalidate gang campaign cache
        revalidateTag(CACHE_TAGS.COMPOSITE_GANG_CAMPAIGNS(gang.gang_id));
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
    await getAuthenticatedUser(supabase);
    
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
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_BASIC(campaignId));
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_MEMBERS(campaignId));
    revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_TERRITORIES(campaignId));
    revalidateTag(CACHE_TAGS.COMPOSITE_CAMPAIGN_OVERVIEW(campaignId));
    revalidateTag(CACHE_TAGS.SHARED_CAMPAIGN_GANG_LIST(campaignId));

    // Invalidate gang campaign caches since campaign was deleted
    if (campaignGangs && campaignGangs.length > 0) {
      campaignGangs.forEach(gang => {
        revalidateTag(CACHE_TAGS.COMPOSITE_GANG_CAMPAIGNS(gang.gang_id));
        revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(gang.gang_id));
      });
    }

    // Invalidate user dashboard cache since user's campaign list changed
    // Note: We'd need the user ID to properly invalidate USER_CAMPAIGNS cache
    
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