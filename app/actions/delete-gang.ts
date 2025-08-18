'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';

export async function deleteGang(gangId: string) {
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

    // Delete the gang
    const { error: deleteError } = await supabase
      .from('gangs')
      .delete()
      .eq('id', gangId);

    if (deleteError) {
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

    return { success: true };
  } catch (error) {
    console.error('Error deleting gang:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to delete gang' 
    };
  }
}
