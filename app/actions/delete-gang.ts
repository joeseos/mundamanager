'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidateTag } from 'next/cache';
import { CACHE_TAGS, invalidateGangCount, invalidateGangPermissionsForUser, invalidateCampaignMembership } from '@/utils/cache-tags';

export async function deleteGang(gangId: string) {
  let step = 'init';
  try {
    step = 'createClient';
    const supabase = await createClient();

    step = 'authenticate';
    // Authenticate user
    await getAuthenticatedUser(supabase);

    step = 'fetchGang';
    // Get gang information to verify ownership
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('id, user_id')
      .eq('id', gangId)
      .single();

    if (gangError || !gang) {
      throw new Error(gangError?.message || 'Gang not found');
    }

    step = 'fetchCampaigns';
    // Fetch campaign associations BEFORE delete (in case of CASCADE)
    const { data: campaigns } = await supabase
      .from('campaign_gangs')
      .select('campaign_id, user_id')
      .eq('gang_id', gangId);

    step = 'deleteGang';
    // Delete the gang
    const { error: deleteError } = await supabase
      .from('gangs')
      .delete()
      .eq('id', gangId);

    if (deleteError) {
      console.error('[deleteGang] Supabase delete failed:', {
        code: deleteError.code,
        message: deleteError.message,
        details: deleteError.details,
        hint: deleteError.hint,
        gangId
      });
      throw deleteError;
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

    return { success: true };
  } catch (error) {
    const errorInfo = {
      step,
      gangId,
      message: error instanceof Error ? error.message : String(error),
      code: error && typeof error === 'object' && 'code' in error ? (error as any).code : undefined,
      hint: error && typeof error === 'object' && 'hint' in error ? (error as any).hint : undefined,
      details: error && typeof error === 'object' && 'details' in error ? (error as any).details : undefined,
    };
    console.error('[deleteGang] Error:', errorInfo);

    return {
      success: false,
      error: errorInfo.message,
      step: errorInfo.step,
      code: errorInfo.code,
      hint: errorInfo.hint,
    };
  }
}
