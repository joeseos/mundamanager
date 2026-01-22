'use server'

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { invalidateFighterVehicleData, invalidateGangFinancials } from '@/utils/cache-tags';
import { updateGangFinancials } from '@/utils/gang-rating-and-wealth';
import { countsTowardRating } from '@/utils/fighter-status';

interface SellVehicleParams {
  vehicleId: string;
  gangId?: string; // optional; will be resolved from vehicle if not provided
  manual_cost?: number;
}

interface SellVehicleResult {
  success: boolean;
  data?: {
    gang: { id: string; credits: number; wealth?: number };
    vehicle_cost?: number;
    updated_gang_rating?: number;
  };
  error?: string;
}

export async function sellVehicle(params: SellVehicleParams): Promise<SellVehicleResult> {
  try {
    const supabase = await createClient();

    // Get the current user
    const user = await getAuthenticatedUser(supabase);

    // Fetch vehicle and resolve gangId/assignment BEFORE deletion
    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .select('id, gang_id, fighter_id, cost')
      .eq('id', params.vehicleId)
      .single();

    if (vehicleError || !vehicle) {
      throw new Error(`Vehicle with ID ${params.vehicleId} not found`);
    }

    const gangId = params.gangId || vehicle.gang_id;
    const isAssigned = !!vehicle.fighter_id;

    // Permission: ensure current user owns the gang
    const { data: gangRow, error: gangFetchError } = await supabase
      .from('gangs')
      .select('id, user_id, credits, rating, wealth')
      .eq('id', gangId)
      .single();

    if (gangFetchError || !gangRow) {
      throw new Error('Failed to fetch gang for vehicle');
    }

    // Note: Authorization is enforced by RLS policies on vehicles table

    // Compute total vehicle cost (base + equipment + effects) BEFORE deletion
    const baseCost = vehicle.cost || 0;

    const { data: equipmentData } = await supabase
      .from('fighter_equipment')
      .select('purchase_cost')
      .eq('vehicle_id', params.vehicleId);
    const equipmentCost =
      equipmentData?.reduce((s: number, eq: any) => s + (eq.purchase_cost || 0), 0) || 0;

    const { data: effectsData } = await supabase
      .from('fighter_effects')
      .select('type_specific_data')
      .eq('vehicle_id', params.vehicleId);
    const effectsCost =
      effectsData?.reduce((s: number, eff: any) => s + (eff.type_specific_data?.credits_increase || 0), 0) || 0;

    const vehicleCost = baseCost + equipmentCost + effectsCost;

    // Perform deletion (vehicle row)
    const { error: deleteError } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', params.vehicleId);

    if (deleteError) {
      throw new Error(`Failed to delete vehicle: ${deleteError.message}`);
    }

    // Determine sell value (manual or default to base cost)
    const sellValue = params.manual_cost ?? baseCost ?? 0;

    // Update gang credits (refund)
    const { data: updatedGang, error: gangUpdateError } = await supabase
      .from('gangs')
      .update({ credits: (gangRow.credits || 0) + sellValue })
      .eq('id', gangId)
      .select('id, credits')
      .single();

    if (gangUpdateError || !updatedGang) {
      throw new Error(`Failed to update gang credits: ${gangUpdateError?.message}`);
    }

    // Check if the vehicle was assigned to an active fighter
    let wasAssignedToActiveFighter = false;
    if (isAssigned && vehicle.fighter_id) {
      const { data: fighterData } = await supabase
        .from('fighters')
        .select('killed, retired, enslaved, captured')
        .eq('id', vehicle.fighter_id)
        .single();
      wasAssignedToActiveFighter = countsTowardRating(fighterData);
    }

    // Calculate rating and wealth deltas
    // Key insight: vehicles assigned to inactive fighters are not counted anywhere
    let ratingDelta = 0;
    let wealthDelta = 0;

    if (!isAssigned) {
      // Unassigned vehicle: was in unassigned pool (counted in wealth only)
      // Selling removes vehicle value from wealth, adds sellValue via credits
      wealthDelta = -vehicleCost + sellValue;
    } else if (wasAssignedToActiveFighter) {
      // Assigned to active fighter: was in rating (counted in wealth via rating)
      // Selling removes vehicle from rating, adds sellValue via credits
      ratingDelta = -vehicleCost;
      wealthDelta = -vehicleCost + sellValue;
    } else {
      // Assigned to inactive fighter: wasn't counted anywhere
      // Selling just adds sellValue via credits
      wealthDelta = sellValue;
    }

    // Compute updated values for return (helper will apply the actual update)
    const updatedGangRating = ratingDelta !== 0 ? Math.max(0, (gangRow.rating || 0) + ratingDelta) : undefined;
    const updatedWealth = wealthDelta !== 0 ? Math.max(0, (gangRow.wealth || 0) + wealthDelta) : undefined;

    if (ratingDelta !== 0 || wealthDelta !== 0) {
      // Use creditsDelta to adjust wealth independently from rating
      await updateGangFinancials(supabase, {
        gangId,
        ratingDelta,
        creditsDelta: wealthDelta - ratingDelta
      });
    }

    // Invalidate caches (credits + rating + fighter vehicles if assigned)
    invalidateGangFinancials(gangId);
    if (vehicle.fighter_id) {
      invalidateFighterVehicleData(vehicle.fighter_id, gangId);
    }

    return {
      success: true,
      data: {
        gang: { id: updatedGang.id, credits: updatedGang.credits, wealth: updatedWealth },
        vehicle_cost: vehicleCost,
        updated_gang_rating: updatedGangRating
      }
    };
  } catch (error) {
    console.error('Error in sellVehicle server action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}


