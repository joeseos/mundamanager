'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';

export async function updateGangImage(
  gangId: string,
  imageUrl?: string | null,
  defaultGangImage?: number | null
) {
  try {
    const supabase = await createClient();

    const updates: { image_url?: string | null; default_gang_image?: number | null } = {};

    if (imageUrl !== undefined) {
      // If imageUrl is provided (including null for removal), update it
      // and clear default_gang_image when setting a custom image
      updates.image_url = imageUrl;
      if (imageUrl !== null) {
        // Setting a custom image, so clear the default image index
        updates.default_gang_image = null;
      }
    }

    if (defaultGangImage !== undefined) {
      // If defaultGangImage is provided, update it
      updates.default_gang_image = defaultGangImage;
      if (defaultGangImage !== null) {
        // Selecting a default image, so clear the custom image URL
        updates.image_url = null;
      } else {
        // Clearing the default image index
        // Don't modify image_url in this case
      }
    }

    const { error: updateError } = await supabase
      .from('gangs')
      .update(updates)
      .eq('id', gangId);

    if (updateError) {
      throw updateError;
    }

    // Revalidate the gang basic data used by the gang page
    revalidateTag(CACHE_TAGS.BASE_GANG_BASIC(gangId));
    // Also revalidate shared basic info used across pages that show the gang's basic info
    revalidateTag(CACHE_TAGS.SHARED_GANG_BASIC_INFO(gangId));

    return { success: true };
  } catch (error) {
    console.error('Error updating gang image:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update gang image'
    };
  }
}
