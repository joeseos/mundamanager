'use server'

import { createClient } from '@/utils/supabase/server';
import { invalidateFighterVehicleData } from '@/utils/cache-tags';
import { updateGangFinancials } from '@/utils/gang-rating-and-wealth';
import { getAuthenticatedUser } from '@/utils/auth';
import { countsTowardRating } from '@/utils/fighter-status';

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

    const previousFighterId = beforeVehicle?.fighter_id;

    // Check if the previous fighter (if any) was active
    let wasPreviousFighterActive = false;
    if (previousFighterId) {
      const { data: prevFighterData } = await supabase
        .from('fighters')
        .select('killed, retired, enslaved, captured')
        .eq('id', previousFighterId)
        .single();

      wasPreviousFighterActive = countsTowardRating(prevFighterData);
    }

    // Check if the new fighter is active
    const { data: newFighterData } = await supabase
      .from('fighters')
      .select('killed, retired, enslaved, captured')
      .eq('id', params.fighterId)
      .single();

    const isNewFighterActive = countsTowardRating(newFighterData);

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

    // Calculate rating and wealth deltas using countsTowardRating helper
    // Key insight: unassigned vehicles count toward wealth, inactive fighter vehicles don't count anywhere
    let ratingDelta = 0;
    let wealthDelta = 0;

    const wasInUnassignedPool = !previousFighterId;
    const wasInRating = previousFighterId && wasPreviousFighterActive;
    const goesToRating = isNewFighterActive;

    if (wasInUnassignedPool) {
      // Vehicle was in unassigned pool (counted in wealth)
      if (goesToRating) {
        // Unassigned → Active: moves from unassigned pool to rating (both count toward wealth)
        ratingDelta = vehicleCost;
        wealthDelta = 0;
      } else {
        // Unassigned → Inactive: leaves unassigned pool, not counted anywhere
        ratingDelta = 0;
        wealthDelta = -vehicleCost;
      }
    } else if (wasInRating) {
      // Vehicle was assigned to active fighter (counted in rating)
      if (goesToRating) {
        // Active → Active: stays in rating
        ratingDelta = 0;
        wealthDelta = 0;
      } else {
        // Active → Inactive: leaves rating, not counted anywhere
        ratingDelta = -vehicleCost;
        wealthDelta = -vehicleCost;
      }
    } else {
      // Vehicle was assigned to inactive fighter (not counted anywhere)
      if (goesToRating) {
        // Inactive → Active: enters rating
        ratingDelta = vehicleCost;
        wealthDelta = vehicleCost;
      } else {
        // Inactive → Inactive: still not counted anywhere
        ratingDelta = 0;
        wealthDelta = 0;
      }
    }

    if (vehicleCost > 0 && (ratingDelta !== 0 || wealthDelta !== 0)) {
      // Use creditsDelta to adjust wealth independently from rating
      // wealthChange = ratingDelta + creditsDelta, so creditsDelta = wealthDelta - ratingDelta
      await updateGangFinancials(supabase, {
        gangId: params.gangId,
        ratingDelta,
        creditsDelta: wealthDelta - ratingDelta
      });
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