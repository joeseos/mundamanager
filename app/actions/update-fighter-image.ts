'use server';

import { createClient } from '@/utils/supabase/server';
import { invalidateFighterDetailsUpdate } from '@/app/lib/queries/invalidation';

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

    // Cache invalidation using centralized TanStack Query cache keys
    invalidateFighterDetailsUpdate({ fighterId, gangId });

    return { success: true };
  } catch (error) {
    console.error('Error updating fighter image:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to update fighter image' 
    };
  }
}
