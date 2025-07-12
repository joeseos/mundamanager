'use server'

import { createClient } from '@/utils/supabase/server';
import { invalidateFighterVehicleData } from '@/utils/cache-tags';

interface RemoveVehicleDamageParams {
  damageId: string;
  fighterId: string;
  gangId: string;
}

interface RemoveVehicleDamageResult {
  success: boolean;
  error?: string;
}

export async function removeVehicleDamage(params: RemoveVehicleDamageParams): Promise<RemoveVehicleDamageResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Remove the vehicle damage
    const { error } = await supabase
      .from('fighter_effects')
      .delete()
      .eq('id', params.damageId);

    if (error) {
      console.error('Error removing vehicle damage:', error);
      throw new Error(error.message || 'Failed to remove vehicle damage');
    }

    // Invalidate cache for the fighter and gang
    invalidateFighterVehicleData(params.fighterId, params.gangId);

    return {
      success: true
    };
  } catch (error) {
    console.error('Error in removeVehicleDamage:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
} 