'use server';

import { invalidateGang, invalidateGangOverview } from '@/utils/cache-tags';
import { createClient } from '@/utils/supabase/server';

export async function updateGangImage(
  gangId: string,
  imageUrl?: string | null,
  defaultGangImage?: number | null,
  gangPortraitId?: string | null
) {
  try {
    const supabase = await createClient();

    const updates: {
      image_url?: string | null;
      default_gang_image?: number | null;
      gang_portrait_id?: string | null;
    } = {};

    if (gangPortraitId) {
      updates.gang_portrait_id = gangPortraitId;
      updates.image_url = null;
      updates.default_gang_image = null;
    } else if (imageUrl !== undefined) {
      // If imageUrl is provided (including null for removal), update it
      // and clear default_gang_image when setting a custom image
      updates.image_url = imageUrl;
      if (imageUrl !== null) {
        // Setting a custom image, so clear the catalogue portrait and the old index
        updates.default_gang_image = null;
        updates.gang_portrait_id = null;
      }
    }

    if (!gangPortraitId && defaultGangImage !== undefined) {
      // If defaultGangImage is provided, update it and drop the catalogue portrait
      // so the index is what the gang shows.
      updates.default_gang_image = defaultGangImage;
      updates.gang_portrait_id = null;
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
    invalidateGang(gangId);
    // Also revalidate shared basic info used across pages that show the gang's basic info
    invalidateGangOverview(gangId);

    return { success: true };
  } catch (error) {
    console.error('Error updating gang image:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update gang image'
    };
  }
}
