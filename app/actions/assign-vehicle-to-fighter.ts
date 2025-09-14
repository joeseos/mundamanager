'use server'

import { createClient } from '@/utils/supabase/server';
import { invalidateFighterVehicleData, invalidateGangRating } from '@/utils/cache-tags';
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
    vehicle_cost?: number;
  };
  error?: string;
}

export async function assignVehicleToFighter(params: AssignVehicleToFighterParams): Promise<AssignVehicleToFighterResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Capture pre-state
    const { data: beforeVehicle } = await supabase
      .from('vehicles')
      .select('fighter_id')
      .eq('id', params.vehicleId)
      .single();

    // Call the Supabase function
    const { data, error } = await supabase.rpc('assign_crew_to_vehicle', {
      p_vehicle_id: params.vehicleId,
      p_fighter_id: params.fighterId,
    });

    if (error) {
      console.error('Error assigning vehicle to fighter:', error);
      throw new Error(error.message || 'Failed to assign vehicle to fighter');
    }

    // Get vehicle cost data to return to frontend for immediate UI update
    const vehicleCost = await calculateVehicleCost(params.vehicleId, supabase);

    // Capture post-state
    const { data: afterVehicle } = await supabase
      .from('vehicles')
      .select('fighter_id')
      .eq('id', params.vehicleId)
      .single();

    // Rating delta: only when previously unassigned and now assigned
    const wasUnassigned = !beforeVehicle?.fighter_id;
    const isAssigned = !!afterVehicle?.fighter_id;
    if (wasUnassigned && isAssigned && vehicleCost > 0) {
      try {
        const { data: ratingRow } = await supabase
          .from('gangs')
          .select('rating')
          .eq('id', params.gangId)
          .single();
        const currentRating = (ratingRow?.rating ?? 0) as number;
        await supabase
          .from('gangs')
          .update({ rating: Math.max(0, currentRating + vehicleCost) })
          .eq('id', params.gangId);
        invalidateGangRating(params.gangId);
      } catch (e) {
        console.error('Failed to update gang rating after vehicle assignment:', e);
      }
    }

    // Invalidate cache for the fighter and gang
    invalidateFighterVehicleData(params.fighterId, params.gangId);

    return {
      success: true,
      data: {
        ...data,
        vehicle_cost: vehicleCost
      }
    };

  } catch (error) {
    console.error('Error in assignVehicleToFighter server action:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Calculate the total cost of a vehicle including equipment and effects
 */
async function calculateVehicleCost(vehicleId: string, supabase: any): Promise<number> {
  // Get base vehicle cost
  const { data: vehicleData, error: vehicleError } = await supabase
    .from('vehicles')
    .select('cost')
    .eq('id', vehicleId)
    .single();

  if (vehicleError) {
    console.error('Error getting vehicle cost:', vehicleError);
    return 0;
  }

  const baseCost = vehicleData?.cost || 0;

  // Get equipment cost
  const { data: equipmentData } = await supabase
    .from('fighter_equipment')
    .select('purchase_cost')
    .eq('vehicle_id', vehicleId);

  const equipmentCost = equipmentData?.reduce((sum: number, eq: any) => sum + (eq.purchase_cost || 0), 0) || 0;

  // Get effects cost
  const { data: effectsData } = await supabase
    .from('fighter_effects')
    .select('type_specific_data')
    .eq('vehicle_id', vehicleId);

  const effectsCost = effectsData?.reduce((sum: number, effect: any) => {
    return sum + (effect.type_specific_data?.credits_increase || 0);
  }, 0) || 0;

  return baseCost + equipmentCost + effectsCost;
} 