'use server'

import { createClient } from '@/utils/supabase/server';
import { invalidateFighterVehicleData } from '@/utils/cache-tags';

interface DeleteVehicleParams {
  vehicleId: string;
  gangId: string;
  assignedFighterId?: string;
}

interface DeleteVehicleResult {
  success: boolean;
  error?: string;
}

export async function deleteVehicle(params: DeleteVehicleParams): Promise<DeleteVehicleResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Delete the vehicle
    const { error } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', params.vehicleId);

    if (error) {
      console.error('Error deleting vehicle:', error);
      throw new Error(error.message || 'Failed to delete vehicle');
    }

    // Invalidate cache for the fighter and gang if the vehicle was assigned to a fighter
    if (params.assignedFighterId) {
      invalidateFighterVehicleData(params.assignedFighterId, params.gangId);
    }

    return {
      success: true
    };

  } catch (error) {
    console.error('Error in deleteVehicle server action:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
} 