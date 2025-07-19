'use server'

import { createClient } from '@/utils/supabase/server';
import { invalidateFighterVehicleData } from '@/utils/cache-tags';

interface UpdateVehicleParams {
  vehicleId: string;
  vehicleName: string;
  specialRules: string[];
  gangId: string;
  assignedFighterId?: string;
}

interface UpdateVehicleResult {
  success: boolean;
  data?: any;
  error?: string;
}

export async function updateVehicle(params: UpdateVehicleParams): Promise<UpdateVehicleResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Update the vehicle
    const { data, error } = await supabase
      .from('vehicles')
      .update({
        vehicle_name: params.vehicleName.trimEnd(),
        special_rules: params.specialRules,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.vehicleId)
      .select()
      .single();

    if (error) {
      console.error('Error updating vehicle:', error);
      throw new Error(error.message || 'Failed to update vehicle');
    }

    // Invalidate cache for the fighter and gang if the vehicle was assigned to a fighter
    if (params.assignedFighterId) {
      invalidateFighterVehicleData(params.assignedFighterId, params.gangId);
    }

    return {
      success: true,
      data
    };

  } catch (error) {
    console.error('Error in updateVehicle server action:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
} 