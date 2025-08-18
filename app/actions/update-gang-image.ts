'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidateTag } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';

export async function updateGangImage(
  gangId: string,
  imageUrl: string | null
) {
  try {
    const supabase = await createClient();

    const { error: updateError } = await supabase
      .from('gangs')
      .update({ image_url: imageUrl })
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
