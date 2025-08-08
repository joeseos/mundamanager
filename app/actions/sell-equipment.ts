'use server'

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { checkAdminOptimized, getAuthenticatedUser } from "@/utils/auth";
import { invalidateFighterDataWithFinancials, invalidateVehicleData, invalidateGangFinancials, invalidateFighterVehicleData, invalidateEquipmentDeletion, invalidateGangRating } from '@/utils/cache-tags';

interface SellEquipmentParams {
  fighter_equipment_id: string;
  manual_cost?: number;
}

interface SellEquipmentResult {
  success: boolean;
  data?: {
    gang: {
      id: string;
      credits: number;
    };
    equipment_sold: {
      id: string;
      fighter_id?: string;
      vehicle_id?: string;
      equipment_id?: string;
      custom_equipment_id?: string;
      sell_value: number;
    };
  };
  error?: string;
}

export async function sellEquipmentFromFighter(params: SellEquipmentParams): Promise<SellEquipmentResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Check if user is an admin (optimized)
    const isAdmin = await checkAdminOptimized(supabase, user);
    
    // Get the equipment data first
    const { data: equipmentData, error: equipmentError } = await supabase
      .from('fighter_equipment')
      .select(`
        id,
        fighter_id,
        vehicle_id,
        equipment_id,
        custom_equipment_id,
        purchase_cost
      `)
      .eq('id', params.fighter_equipment_id)
      .single();

    if (equipmentError || !equipmentData) {
      throw new Error(`Fighter equipment with ID ${params.fighter_equipment_id} not found`);
    }

    // Determine the gang_id based on whether it's fighter or vehicle equipment
    let gangId: string;
    let vehicleAssigned = false;
    
    if (equipmentData.fighter_id) {
      // Get gang_id from fighter
      const { data: fighter, error: fighterError } = await supabase
        .from('fighters')
        .select('gang_id')
        .eq('id', equipmentData.fighter_id)
        .single();
        
      if (fighterError || !fighter) {
        throw new Error('Fighter not found for this equipment');
      }
      gangId = fighter.gang_id;
    } else if (equipmentData.vehicle_id) {
      // Get gang_id from vehicle and whether vehicle is assigned
      const { data: vehicle, error: vehicleError } = await supabase
        .from('vehicles')
        .select('gang_id, fighter_id')
        .eq('id', equipmentData.vehicle_id)
        .single();
        
      if (vehicleError || !vehicle) {
        throw new Error('Vehicle not found for this equipment');
      }
      gangId = vehicle.gang_id;
      vehicleAssigned = !!vehicle.fighter_id;
    } else {
      throw new Error('Equipment is not associated with a fighter or vehicle');
    }

    // If user is not an admin, check if they have permission for this gang
    if (!isAdmin) {
      const { data: gang, error: gangError } = await supabase
        .from('gangs')
        .select('user_id')
        .eq('id', gangId)
        .single();

      if (gangError || !gang) {
        throw new Error('Gang not found');
      }

      if (gang.user_id !== user.id) {
        throw new Error('User does not have permission to sell this equipment');
      }
    }

    // Determine sell value (manual or default to purchase cost)
    const sellValue = params.manual_cost ?? equipmentData.purchase_cost ?? 0;

    // Find associated effects before deletion
    const { data: associatedEffects } = await supabase
      .from('fighter_effects')
      .select('id, type_specific_data')
      .eq('fighter_equipment_id', params.fighter_equipment_id);

    // Start transaction-like sequence: Delete equipment and update gang credits
    const { error: deleteError } = await supabase
      .from('fighter_equipment')
      .delete()
      .eq('id', params.fighter_equipment_id);

    if (deleteError) {
      throw new Error(`Failed to delete equipment: ${deleteError.message}`);
    }

    // Update gang credits - get current credits and update manually
    const { data: currentGang, error: getCurrentError } = await supabase
      .from('gangs')
      .select('credits, rating')
      .eq('id', gangId)
      .single();
      
    if (getCurrentError || !currentGang) {
      throw new Error('Failed to get current gang credits');
    }
    
    const { data: updatedGang, error: updateError } = await supabase
      .from('gangs')
      .update({ credits: currentGang.credits + sellValue })
      .eq('id', gangId)
      .select('id, credits')
      .single();
      
    if (updateError || !updatedGang) {
      throw new Error(`Failed to update gang credits: ${updateError?.message}`);
    }

    // Compute rating delta: subtract purchase_cost and associated effects credits when applicable
    let ratingDelta = 0;
    if (equipmentData.fighter_id || (equipmentData.vehicle_id && vehicleAssigned)) {
      ratingDelta -= (equipmentData.purchase_cost || 0);
      const effectsCredits = (associatedEffects || []).reduce((s, eff: any) => s + (eff.type_specific_data?.credits_increase || 0), 0);
      ratingDelta -= effectsCredits;
    }

    if (ratingDelta !== 0) {
      try {
        const { data: ratingRow } = await supabase
          .from('gangs')
          .select('rating')
          .eq('id', gangId)
          .single();
        const currentRating = (ratingRow?.rating ?? 0) as number;
        await supabase
          .from('gangs')
          .update({ rating: Math.max(0, currentRating + ratingDelta) })
          .eq('id', gangId);
        invalidateGangRating(gangId);
      } catch (e) {
        console.error('Failed to update gang rating after selling equipment:', e);
      }
    }

    // Invalidate caches - selling equipment affects gang credits/rating
    if (equipmentData.fighter_id) {
      // Use equipment deletion invalidation since selling is essentially deletion with credit refund
      // This ensures both fighter equipment list AND gang credits are properly invalidated
      invalidateEquipmentDeletion({
        fighterId: equipmentData.fighter_id,
        gangId: gangId
      });
    } else if (equipmentData.vehicle_id) {
      // For vehicle equipment, we need to get the fighter_id from the vehicle
      const { data: vehicleData, error: vehicleError } = await supabase
        .from('vehicles')
        .select('fighter_id')
        .eq('id', equipmentData.vehicle_id)
        .single();
      
      if (!vehicleError && vehicleData?.fighter_id) {
        // Use equipment deletion invalidation for the fighter to ensure equipment list updates
        invalidateEquipmentDeletion({
          fighterId: vehicleData.fighter_id,
          gangId: gangId
        });
        invalidateFighterVehicleData(vehicleData.fighter_id, gangId);
      }
      
      // Also invalidate vehicle-specific cache tags
      invalidateVehicleData(equipmentData.vehicle_id);
    } else {
      // For other cases, invalidate gang financials
      invalidateGangFinancials(gangId);
    }

    return {
      success: true,
      data: {
        gang: {
          id: updatedGang.id,
          credits: updatedGang.credits
        },
        equipment_sold: {
          id: equipmentData.id,
          fighter_id: equipmentData.fighter_id || undefined,
          vehicle_id: equipmentData.vehicle_id || undefined,
          equipment_id: equipmentData.equipment_id || undefined,
          custom_equipment_id: equipmentData.custom_equipment_id || undefined,
          sell_value: sellValue
        }
      }
    };

  } catch (error) {
    console.error('Error in sellEquipmentFromFighter server action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
} 