'use server'

import { createClient } from '@/utils/supabase/server';
import { invalidateFighterVehicleData, invalidateGangRating } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';
import { countsTowardRating } from '@/utils/fighter-status';

interface UnassignVehicleParams {
  vehicleId: string;
  gangId: string;
}

interface UnassignVehicleResult {
  success: boolean;
  data?: {
    previous_fighter_id?: string | null;
  };
  error?: string;
}

export async function unassignVehicle(params: UnassignVehicleParams): Promise<UnassignVehicleResult> {
  try {
    const supabase = await createClient();

    // Get the current user with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Capture current assignment before unassigning
    const { data: beforeVehicle } = await supabase
      .from('vehicles')
      .select('fighter_id')
      .eq('id', params.vehicleId)
      .single();

    const previousFighterId = beforeVehicle?.fighter_id as string | null | undefined;

    // If already unassigned, nothing to do
    if (!previousFighterId) {
      return { success: true, data: { previous_fighter_id: null } };
    }

    // Check if the previous fighter is currently active
    let wasFighterActive = false;
    if (previousFighterId) {
      const { data: fighterData } = await supabase
        .from('fighters')
        .select('killed, retired, enslaved, captured')
        .eq('id', previousFighterId)
        .single();

      wasFighterActive = countsTowardRating(fighterData);
    }

    // Get vehicle cost data before unassigning for rating calculation
    const vehicleCost = await calculateVehicleCost(params.vehicleId, supabase);

    // Unassign vehicle
    const { error: updateError } = await supabase
      .from('vehicles')
      .update({ fighter_id: null, updated_at: new Date().toISOString() })
      .eq('id', params.vehicleId);

    if (updateError) {
      console.error('Error unassigning vehicle:', updateError);
      throw new Error(updateError.message || 'Failed to unassign vehicle');
    }

    // Rating delta: only reduce rating if vehicle was assigned to an ACTIVE fighter
    // If fighter is killed/retired/enslaved, their cost (including vehicle) is already removed from rating
    if (wasFighterActive && vehicleCost > 0) {
      try {
        const { data: ratingRow } = await supabase
          .from('gangs')
          .select('rating')
          .eq('id', params.gangId)
          .single();
        const currentRating = (ratingRow?.rating ?? 0) as number;
        await supabase
          .from('gangs')
          .update({ rating: Math.max(0, currentRating - vehicleCost) })
          .eq('id', params.gangId);
        invalidateGangRating(params.gangId);
      } catch (e) {
        console.error('Failed to update gang rating after vehicle unassignment:', e);
      }
    }

    // Invalidate cache for the fighter and gang
    if (previousFighterId) {
      invalidateFighterVehicleData(previousFighterId, params.gangId);
    }

    return {
      success: true,
      data: {
        previous_fighter_id: previousFighterId ?? null,
      }
    };

  } catch (error) {
    console.error('Error in unassignVehicle server action:', error);
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
