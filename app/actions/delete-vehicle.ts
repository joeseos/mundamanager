'use server'

import { createClient } from '@/utils/supabase/server';
import { revalidateTag } from 'next/cache';
import { invalidateFighterVehicleData, CACHE_TAGS } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';
import { countsTowardRating } from '@/utils/fighter-status';
import { updateGangFinancials, GangFinancialUpdateResult } from '@/utils/gang-rating-and-wealth';
import { logVehicleAction } from './logs/vehicle-logs';

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

    // Get the current user with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Fetch vehicle data INCLUDING cost and name BEFORE deletion
    const { data: vehBefore } = await supabase
      .from('vehicles')
      .select('fighter_id, cost, vehicle_name')
      .eq('id', params.vehicleId)
      .single();
    
    const vehicleName = vehBefore?.vehicle_name || 'Unknown Vehicle';

    // Calculate vehicle total cost BEFORE deletion (assigned or unassigned)
    const baseCost = vehBefore?.cost || 0;

    const { data: equipmentData } = await supabase
      .from('fighter_equipment')
      .select('purchase_cost')
      .eq('vehicle_id', params.vehicleId);
    const equipmentCost = equipmentData?.reduce((s: number, eq: any) => s + (eq.purchase_cost || 0), 0) || 0;

    const { data: effectsData } = await supabase
      .from('fighter_effects')
      .select('type_specific_data')
      .eq('vehicle_id', params.vehicleId);
    const effectsCost = effectsData?.reduce((s: number, eff: any) => s + (eff.type_specific_data?.credits_increase || 0), 0) || 0;

    const vehicleCost = baseCost + equipmentCost + effectsCost;
    const wasAssigned = !!vehBefore?.fighter_id;

    // Delete related records first to avoid foreign key constraint issues
    // Delete fighter_equipment records
    const { error: equipmentDeleteError } = await supabase
      .from('fighter_equipment')
      .delete()
      .eq('vehicle_id', params.vehicleId);

    if (equipmentDeleteError) {
      console.error('Error deleting vehicle equipment:', equipmentDeleteError);
      throw new Error(`Failed to delete vehicle equipment: ${equipmentDeleteError.message}`);
    }

    // Delete fighter_effects records
    const { error: effectsDeleteError } = await supabase
      .from('fighter_effects')
      .delete()
      .eq('vehicle_id', params.vehicleId);

    if (effectsDeleteError) {
      console.error('Error deleting vehicle effects:', effectsDeleteError);
      throw new Error(`Failed to delete vehicle effects: ${effectsDeleteError.message}`);
    }

    // NOW delete the vehicle
    const { error } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', params.vehicleId);

    if (error) {
      console.error('Error deleting vehicle:', error);
      throw new Error(error.message || 'Failed to delete vehicle');
    }

    // Check if the vehicle was assigned to an active fighter
    let wasAssignedToActiveFighter = false;
    let fighterName: string | undefined;
    if (wasAssigned && vehBefore?.fighter_id) {
      const { data: fighterData } = await supabase
        .from('fighters')
        .select('killed, retired, enslaved, captured, fighter_name')
        .eq('id', vehBefore.fighter_id)
        .single();
      wasAssignedToActiveFighter = countsTowardRating(fighterData);
      fighterName = fighterData?.fighter_name;
    }

    // Calculate rating and wealth deltas
    // Key insight: vehicles assigned to inactive fighters are not counted anywhere
    let ratingDelta = 0;
    let wealthDelta = 0;

    if (!wasAssigned) {
      // Unassigned vehicle: was in unassigned pool (counted in wealth only)
      wealthDelta = -vehicleCost;
    } else if (wasAssignedToActiveFighter) {
      // Assigned to active fighter: was in rating (counted in wealth via rating)
      ratingDelta = -vehicleCost;
      wealthDelta = -vehicleCost;
    }
    // Assigned to inactive fighter: wasn't counted anywhere, no change needed

    // Update rating and wealth after vehicle deletion
    let financialResult: GangFinancialUpdateResult | null = null;
    if (vehicleCost > 0 && (ratingDelta !== 0 || wealthDelta !== 0)) {
      // stashValueDelta accounts for unassigned vehicles (wealthDelta but no ratingDelta)
      financialResult = await updateGangFinancials(supabase, {
        gangId: params.gangId,
        ratingDelta,
        stashValueDelta: wealthDelta - ratingDelta
      });

      if (!financialResult.success) {
        throw new Error(financialResult.error || 'Failed to update gang financials');
      }
    }

    // Log vehicle deletion
    // Pass vehicle_name since vehicle is already deleted
    try {
      await logVehicleAction({
        gang_id: params.gangId,
        vehicle_id: params.vehicleId,
        vehicle_name: vehicleName, // Required: pass name since vehicle is already deleted
        fighter_id: vehBefore?.fighter_id || undefined,
        fighter_name: fighterName, // Optional: pass to avoid extra fetch
        action_type: 'vehicle_deleted',
        user_id: user.id,
        oldCredits: financialResult?.oldValues?.credits,
        oldRating: financialResult?.oldValues?.rating,
        oldWealth: financialResult?.oldValues?.wealth,
        newCredits: financialResult?.newValues?.credits,
        newRating: financialResult?.newValues?.rating,
        newWealth: financialResult?.newValues?.wealth
      });
    } catch (logError) {
      console.error('Failed to log vehicle deletion:', logError);
      // Don't fail the main operation for logging errors
    }

    // Invalidate cache for the fighter and gang if the vehicle was assigned to a fighter
    if (params.assignedFighterId) {
      invalidateFighterVehicleData(params.assignedFighterId, params.gangId);
    }

    // Always refresh the gang vehicles list (covers assigned and unassigned views)
    revalidateTag(CACHE_TAGS.BASE_GANG_VEHICLES(params.gangId));

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