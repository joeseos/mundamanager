'use server'

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { invalidateFighterVehicleData, invalidateGangFinancials, invalidateGangRating } from '@/utils/cache-tags';

interface SellVehicleParams {
  vehicleId: string;
  gangId?: string; // optional; will be resolved from vehicle if not provided
  manual_cost?: number;
}

interface SellVehicleResult {
  success: boolean;
  data?: {
    gang: { id: string; credits: number };
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
      .select('id, user_id, credits, rating')
      .eq('id', gangId)
      .single();

    if (gangFetchError || !gangRow) {
      throw new Error('Failed to fetch gang for vehicle');
    }
    if (gangRow.user_id !== user.id) {
      throw new Error('User does not have permission to sell this vehicle');
    }

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

    // If it was assigned to a fighter, subtract its total cost from gang rating
    let updatedGangRating: number | undefined = undefined;
    if (isAssigned && vehicleCost > 0) {
      try {
        const { data: ratingRow } = await supabase
          .from('gangs')
          .select('rating')
          .eq('id', gangId)
          .single();
        const currentRating = (ratingRow?.rating ?? 0) as number;
        updatedGangRating = Math.max(0, currentRating - vehicleCost);
        await supabase
          .from('gangs')
          .update({ rating: updatedGangRating })
          .eq('id', gangId);
        invalidateGangRating(gangId);
      } catch (e) {
        console.error('Failed to update gang rating after selling vehicle:', e);
      }
    }

    // Invalidate caches (credits + rating + fighter vehicles if assigned)
    invalidateGangFinancials(gangId);
    if (vehicle.fighter_id) {
      invalidateFighterVehicleData(vehicle.fighter_id, gangId);
    }

    return {
      success: true,
      data: {
        gang: { id: updatedGang.id, credits: updatedGang.credits },
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


