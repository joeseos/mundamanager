'use server'

import { revalidateTag } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { CACHE_TAGS, invalidateFighterVehicleData, invalidateGangFinancials } from '@/utils/cache-tags';
import { updateGangFinancials } from '@/utils/gang-rating-and-wealth';
import { countsTowardRating } from '@/utils/fighter-status';
import { logVehicleAction } from './logs/vehicle-logs';

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
      .select('id, gang_id, fighter_id, cost, vehicle_name')
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

    // Delete related records first to avoid foreign key constraint issues
    // Effects reference equipment via FKs, so delete effects before equipment
    const { error: effectsDeleteError } = await supabase
      .from('fighter_effects')
      .delete()
      .eq('vehicle_id', params.vehicleId);

    if (effectsDeleteError) {
      throw new Error(`Failed to delete vehicle effects: ${effectsDeleteError.message}`);
    }

    const { error: equipmentDeleteError } = await supabase
      .from('fighter_equipment')
      .delete()
      .eq('vehicle_id', params.vehicleId);

    if (equipmentDeleteError) {
      throw new Error(`Failed to delete vehicle equipment: ${equipmentDeleteError.message}`);
    }

    // Now delete the vehicle row
    const { error: deleteError } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', params.vehicleId);

    if (deleteError) {
      throw new Error(`Failed to delete vehicle: ${deleteError.message}`);
    }

    // Determine sell value (manual or default to base cost)
    const sellValue = params.manual_cost ?? baseCost ?? 0;

    // Check if the vehicle was assigned to an active fighter
    let wasAssignedToActiveFighter = false;
    let fighterName: string | undefined;
    if (isAssigned && vehicle.fighter_id) {
      const { data: fighterData } = await supabase
        .from('fighters')
        .select('killed, retired, enslaved, captured, fighter_name')
        .eq('id', vehicle.fighter_id)
        .single();
      wasAssignedToActiveFighter = countsTowardRating(fighterData);
      fighterName = fighterData?.fighter_name;
    }

    // Calculate rating and wealth deltas
    // Key insight: vehicles assigned to inactive fighters are not counted anywhere
    let ratingDelta = 0;

    if (!isAssigned) {
      // Unassigned vehicle: was in unassigned pool (counted in wealth only)
      // Selling removes vehicle value from wealth, adds sellValue via credits
      // wealthDelta = -vehicleCost + sellValue, which equals creditsDelta + stashValueDelta
      // Since it's unassigned, stashValueDelta = -vehicleCost, creditsDelta = sellValue
    } else if (wasAssignedToActiveFighter) {
      // Assigned to active fighter: was in rating (counted in wealth via rating)
      // Selling removes vehicle from rating, adds sellValue via credits
      ratingDelta = -vehicleCost;
    } else {
      // Assigned to inactive fighter: wasn't counted anywhere
      // Selling just adds sellValue via credits
    }

    // Update credits, rating and wealth using centralized helper
    // For unassigned: stashValueDelta = -vehicleCost (removes from stash value)
    // For assigned: ratingDelta handles the vehicle removal
    const financialResult = await updateGangFinancials(supabase, {
      gangId,
      ratingDelta,
      creditsDelta: sellValue,
      stashValueDelta: !isAssigned ? -vehicleCost : 0
    });

    if (!financialResult.success) {
      throw new Error(financialResult.error || 'Failed to update gang financials');
    }

    const updatedGangRating = financialResult.newValues?.rating;
    const updatedWealth = financialResult.newValues?.wealth;

    // Log vehicle sale
    // Pass vehicle_name since vehicle is already deleted
    try {
      await logVehicleAction({
        gang_id: gangId,
        vehicle_id: params.vehicleId,
        vehicle_name: vehicle.vehicle_name, // Required: pass name since vehicle is already deleted
        fighter_id: vehicle.fighter_id || undefined,
        fighter_name: fighterName, // Optional: pass to avoid extra fetch
        action_type: 'vehicle_sold',
        cost: sellValue, // Pass sell value to show in log description
        user_id: user.id,
        oldCredits: financialResult.oldValues?.credits,
        oldRating: financialResult.oldValues?.rating,
        oldWealth: financialResult.oldValues?.wealth,
        newCredits: financialResult.newValues?.credits,
        newRating: financialResult.newValues?.rating,
        newWealth: financialResult.newValues?.wealth
      });
    } catch (logError) {
      console.error('Failed to log vehicle sale:', logError);
      // Don't fail the main operation for logging errors
    }

    // Invalidate caches (credits + rating + fighter vehicles if assigned)
    invalidateGangFinancials(gangId);
    if (vehicle.fighter_id) {
      invalidateFighterVehicleData(vehicle.fighter_id, gangId);
    }

    // Always invalidate vehicle list caches (even for unassigned vehicles)
    revalidateTag(CACHE_TAGS.BASE_GANG_VEHICLES(gangId));
    revalidateTag(CACHE_TAGS.COMPUTED_GANG_VEHICLE_COUNT(gangId));

    return {
      success: true,
      data: {
        gang: { 
          id: gangId, 
          credits: financialResult.newValues?.credits ?? 0, 
          wealth: updatedWealth 
        },
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


