'use server'

import { createClient } from '@/utils/supabase/server';
import { invalidateFighterVehicleData } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';

interface AssignVehicleToFighterParams {
  vehicleId: string;
  fighterId: string;
  gangId: string;
}

interface AssignVehicleToFighterResult {
  success: boolean;
  data?: {
    removed_from?: any;
    assigned_to?: any;
  };
  error?: string;
}

export async function assignVehicleToFighter(params: AssignVehicleToFighterParams): Promise<AssignVehicleToFighterResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Call the Supabase function
    const { data, error } = await supabase.rpc('assign_crew_to_vehicle', {
      p_vehicle_id: params.vehicleId,
      p_fighter_id: params.fighterId,
    });

    if (error) {
      console.error('Error assigning vehicle to fighter:', error);
      throw new Error(error.message || 'Failed to assign vehicle to fighter');
    }

    // Invalidate cache for the fighter and gang
    invalidateFighterVehicleData(params.fighterId, params.gangId);

    return {
      success: true,
      data
    };

  } catch (error) {
    console.error('Error in assignVehicleToFighter server action:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
} 