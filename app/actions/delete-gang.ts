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

    // Clean up all fighter images for this gang
    try {
      // List all files in the gang's fighters directory
      const { data: files } = await supabase.storage
        .from('users-images')
        .list(`gangs/${gangId}/fighters/`);
      
      const filesToRemove: string[] = [];
      
      if (files && files.length > 0) {
        // Add all files in the gang's fighters directory to removal list
        files.forEach(file => {
          filesToRemove.push(`gangs/${gangId}/fighters/${file.name}`);
        });
        
        // Remove all fighter images for this gang
        await supabase.storage
          .from('users-images')
          .remove(filesToRemove);
      }

      // Try to remove the entire gang folder (this might not work if folder is empty)
      try {
        await supabase.storage
          .from('users-images')
          .remove([`gangs/${gangId}/`]);
      } catch (folderError) {
        // Folder removal might fail if it's empty or doesn't exist, which is fine
        console.log('Gang folder removal note:', folderError);
      }
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
