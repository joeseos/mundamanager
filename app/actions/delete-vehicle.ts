'use server'

import { createClient } from '@/utils/supabase/server';
import { invalidateFighterVehicleData, invalidateGangRating } from '@/utils/cache-tags';
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

    // Before deletion: fetch assignment state to compute rating delta
    const { data: vehBefore } = await supabase
      .from('vehicles')
      .select('fighter_id')
      .eq('id', params.vehicleId)
      .single();

    // Delete the vehicle
    const { error } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', params.vehicleId);

    if (error) {
      console.error('Error deleting vehicle:', error);
      throw new Error(error.message || 'Failed to delete vehicle');
    }

    // If assigned pre-delete, subtract its total cost from rating
    if (vehBefore?.fighter_id) {
      try {
        const vehicleCost = await calculateVehicleCost(params.vehicleId, supabase);
        if (vehicleCost > 0) {
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
        }
      } catch (e) {
        console.error('Failed to update gang rating after vehicle deletion:', e);
      }
    }

    // Invalidate cache for the fighter and gang if the vehicle was assigned to a fighter
    if (params.assignedFighterId) {
      invalidateFighterVehicleData(params.assignedFighterId, params.gangId);
    }

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

async function calculateVehicleCost(vehicleId: string, supabase: any): Promise<number> {
  // Since the vehicle row is deleted, compute cost from related tables using the ID
  const { data: base } = await supabase
    .from('vehicles')
    .select('cost')
    .eq('id', vehicleId)
    .single();
  const baseCost = base?.cost || 0;

  const { data: equipmentData } = await supabase
    .from('fighter_equipment')
    .select('purchase_cost')
    .eq('vehicle_id', vehicleId);
  const equipmentCost = equipmentData?.reduce((s: number, eq: any) => s + (eq.purchase_cost || 0), 0) || 0;

  const { data: effectsData } = await supabase
    .from('fighter_effects')
    .select('type_specific_data')
    .eq('vehicle_id', vehicleId);
  const effectsCost = effectsData?.reduce((s: number, eff: any) => s + (eff.type_specific_data?.credits_increase || 0), 0) || 0;

  return baseCost + equipmentCost + effectsCost;
} 