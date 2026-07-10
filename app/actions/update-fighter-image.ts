'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidateTag } from 'next/cache';
import { TAGS } from '@/utils/cache-tags';
export async function updateFighterImage(
  fighterId: string,
  gangId: string,
  imageUrl: string | null
) {
  try {
    const supabase = await createClient();
    
    // Update the database
    const { error: updateError } = await supabase
      .from('fighters')
      .update({ image_url: imageUrl })
      .eq('id', fighterId);

    if (updateError) {
      throw updateError;
    }

    // Invalidate cache for fighter data
    revalidateTag(TAGS.fighter(fighterId), { expire: 0 });
    revalidateTag(TAGS.gang(gangId), { expire: 0 });

    return { success: true };
  } catch (error) {
    console.error('Error updating fighter image:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update fighter image' 
    };
  }
}
