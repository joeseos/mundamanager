'use server'

import { createClient } from '@/utils/supabase/server';
import { invalidateFighterVehicleData } from '@/utils/cache-tags';
import { updateGangFinancials, GangFinancialUpdateResult } from '@/utils/gang-rating-and-wealth';
import { getAuthenticatedUser } from '@/utils/auth';
import { countsTowardRating } from '@/utils/fighter-status';
import { logVehicleAction } from './logs/vehicle-logs';

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

    // Get vehicle name and cost data before unassigning for rating calculation
    const { data: vehicleData } = await supabase
      .from('vehicles')
      .select('vehicle_name')
      .eq('id', params.vehicleId)
      .single();
    
    const vehicleName = vehicleData?.vehicle_name || 'Unknown Vehicle';
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

    // Calculate rating and wealth deltas using countsTowardRating helper
    // When unassigning: vehicle enters the "unassigned pool" which counts toward wealth
    let ratingDelta = 0;
    if (wasFighterActive) {
      ratingDelta = -vehicleCost;
    }
    // wealthDelta = ratingDelta + vehicleCost
    // - Active fighter: -vehicleCost + vehicleCost = 0 (moves from rating to unassigned)
    // - Inactive fighter: 0 + vehicleCost = +vehicleCost (enters unassigned pool)
    const wealthDelta = ratingDelta + vehicleCost;

    let financialResult: GangFinancialUpdateResult | null = null;
    if (vehicleCost > 0 && (ratingDelta !== 0 || wealthDelta !== 0)) {
      // wealthDelta = ratingDelta + vehicleCost, so creditsDelta = vehicleCost
      financialResult = await updateGangFinancials(supabase, {
        gangId: params.gangId,
        ratingDelta,
        creditsDelta: vehicleCost
      });

      if (!financialResult.success) {
        throw new Error(financialResult.error || 'Failed to update gang financials');
      }
    }

    // Log vehicle unassignment
    try {
      await logVehicleAction({
        gang_id: params.gangId,
        vehicle_id: params.vehicleId,
        fighter_id: previousFighterId || undefined,
        action_type: 'vehicle_unassigned',
        user_id: user.id,
        oldCredits: financialResult?.oldValues?.credits,
        oldRating: financialResult?.oldValues?.rating,
        oldWealth: financialResult?.oldValues?.wealth,
        newCredits: financialResult?.newValues?.credits,
        newRating: financialResult?.newValues?.rating,
        newWealth: financialResult?.newValues?.wealth
      });
    } catch (logError) {
      console.error('Failed to log vehicle unassignment:', logError);
      // Don't fail the main operation for logging errors
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
