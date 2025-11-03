'use server'

import { createClient } from '@/utils/supabase/server';
import { revalidateTag } from 'next/cache';
import { invalidateFighterVehicleData, invalidateGangRating, CACHE_TAGS } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';

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

    // Fetch vehicle data INCLUDING cost BEFORE deletion
    const { data: vehBefore } = await supabase
      .from('vehicles')
      .select('fighter_id, cost')
      .eq('id', params.vehicleId)
      .single();

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

    // Update rating and wealth after vehicle deletion
    if (vehicleCost > 0) {
      try {
        const { data: gangRow } = await supabase
          .from('gangs')
          .select('rating, wealth')
          .eq('id', params.gangId)
          .single();
        const currentRating = (gangRow?.rating ?? 0) as number;
        const currentWealth = (gangRow?.wealth ?? 0) as number;

        let ratingDelta = 0;
        let wealthDelta = -vehicleCost; // Wealth always decreases by vehicle cost

        if (wasAssigned) {
          // Assigned vehicle: rating decreases by vehicle cost
          ratingDelta = -vehicleCost;
        }
        // Unassigned vehicle: rating unchanged (ratingDelta = 0)

        await supabase
          .from('gangs')
          .update({
            rating: Math.max(0, currentRating + ratingDelta),
            wealth: Math.max(0, currentWealth + wealthDelta)
          })
          .eq('id', params.gangId);
        invalidateGangRating(params.gangId);
      } catch (e) {
        console.error('Failed to update gang rating/wealth after vehicle deletion:', e);
      }
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