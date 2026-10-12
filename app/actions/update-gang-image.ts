'use server';

import { invalidateGang, invalidateGangOverview } from '@/utils/cache-tags';
import { createClient } from '@/utils/supabase/server';

export async function updateGangImage(
  gangId: string,
  imageUrl?: string | null,
  gangPortraitId?: string | null
) {
  try {
    const supabase = await createClient();

    const updates: {
      image_url?: string | null;
      gang_portrait_id?: string | null;
    } = {};

    if (gangPortraitId) {
      updates.gang_portrait_id = gangPortraitId;
      updates.image_url = null;
    } else if (imageUrl === null && gangPortraitId === null) {
      updates.image_url = null;
      updates.gang_portrait_id = null;
    } else if (imageUrl !== undefined) {
      updates.image_url = imageUrl;
      if (imageUrl !== null) {
        updates.gang_portrait_id = null;
      }
    }

    const { error: updateError } = await supabase
      .from('gangs')
      .update(updates)
      .eq('id', gangId);

    if (updateError) {
      throw updateError;
    }

    invalidateGang(gangId);
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
