'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidateTag } from 'next/cache';
import { CACHE_TAGS, invalidateGangCount, invalidateGangPermissionsForUser, invalidateCampaignMembership } from '@/utils/cache-tags';

export async function deleteGang(gangId: string) {
  console.log('[deleteGang] Starting:', gangId);

  try {
    const supabase = await createClient();

    // Authenticate user
    await getAuthenticatedUser(supabase);

    // Get gang information to verify ownership
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('id, user_id')
      .eq('id', gangId)
      .single();

    if (gangError || !gang) {
      throw new Error('Gang not found');
    }

    // Fetch campaign associations BEFORE delete (in case of CASCADE)
    const { data: campaigns } = await supabase
      .from('campaign_gangs')
      .select('campaign_id, user_id')
      .eq('gang_id', gangId);

    // Delete the gang
    const { error: deleteError } = await supabase
      .from('gangs')
      .delete()
      .eq('id', gangId);

    // Handle delete error inline - don't throw
    if (deleteError) {
      console.error('[deleteGang] Delete failed:', deleteError);
      return {
        success: false,
        error: deleteError.message || 'Database error during delete'
      };
    }

    // Clean up all images for this gang (both gang image and fighter images)
    try {
      const filesToRemove: string[] = [];

      // 1) Remove any files directly under gangs/{gangId}/ (e.g., gang image)
      try {
        const { data: gangRootFiles } = await supabase.storage
          .from('users-images')
          .list(`gangs/${gangId}/`);
        if (gangRootFiles && gangRootFiles.length > 0) {
          gangRootFiles.forEach(file => {
            // Skip directory markers; list returns only files at this level
            if (file.name) filesToRemove.push(`gangs/${gangId}/${file.name}`);
          });
        }
      } catch (e) {
        console.log('Note: failed listing gang root files for deletion', e);
      }

      // 2) Remove any files under gangs/{gangId}/fighters/
      try {
        const { data: fighterFiles } = await supabase.storage
          .from('users-images')
          .list(`gangs/${gangId}/fighters/`);
        if (fighterFiles && fighterFiles.length > 0) {
          fighterFiles.forEach(file => {
            if (file.name) filesToRemove.push(`gangs/${gangId}/fighters/${file.name}`);
          });
        }
      } catch (e) {
        console.log('Note: failed listing fighter files for deletion', e);
      }

      // 3) Remove accumulated files (if any)
      if (filesToRemove.length > 0) {
        await supabase.storage
          .from('users-images')
          .remove(filesToRemove);
      }

      // Supabase folders are virtual; once files are gone, the folder disappears in UI
    } catch (storageError) {
      // Log the error but don't fail the gang deletion
      console.error('Error cleaning up gang images:', storageError);
    }

    // Invalidate user's gang cache
    revalidateTag(CACHE_TAGS.USER_GANGS(gang.user_id));
    revalidateTag(CACHE_TAGS.USER_DASHBOARD(gang.user_id));

    // Invalidate gang permissions cache
    invalidateGangPermissionsForUser({
      userId: gang.user_id,
      gangId: gangId
    });

    // Invalidate campaign membership caches if gang was in any campaigns (fetched before delete)
    if (campaigns && campaigns.length > 0) {
      campaigns.forEach(camp => {
        invalidateCampaignMembership({
          campaignId: camp.campaign_id,
          gangId: gangId,
          userId: camp.user_id,
          action: 'leave'
        });
      });
    }

    // Invalidate global gang count
    invalidateGangCount();

    console.log('[deleteGang] Success:', gangId);
    return { success: true };
  } catch (error) {
    console.error('[deleteGang] Caught error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An error occurred'
    };
  }
}
