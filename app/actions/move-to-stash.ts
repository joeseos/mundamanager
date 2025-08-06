'use server'

import { createClient } from "@/utils/supabase/server";
import { checkAdminOptimized, getAuthenticatedUser } from "@/utils/auth";
import { invalidateFighterData, invalidateFighterDataWithFinancials, invalidateFighterEquipment, invalidateVehicleData, invalidateGangFinancials, invalidateFighterVehicleData, invalidateGangStash } from '@/utils/cache-tags';

interface MoveToStashParams {
  fighter_equipment_id: string;
}

interface MoveToStashResult {
  success: boolean;
  data?: {
    stash_id: string;
    equipment_moved: {
      id: string;
      fighter_id?: string;
      vehicle_id?: string;
      equipment_id?: string;
      custom_equipment_id?: string;
    };
  };
  error?: string;
}

export async function moveEquipmentToStash(params: MoveToStashParams): Promise<MoveToStashResult> {
  const supabase = await createClient();
  
  try {
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
        purchase_cost,
        original_cost,
        is_master_crafted
      `)
      .eq('id', params.fighter_equipment_id)
      .single();

    if (equipmentError || !equipmentData) {
      console.error('Equipment lookup error:', equipmentError);
      console.error('Looking for equipment ID:', params.fighter_equipment_id);
      throw new Error(`Fighter equipment with ID ${params.fighter_equipment_id} not found. Error: ${equipmentError?.message || 'No data returned'}`);
    }

    // Determine the gang_id based on whether it's fighter or vehicle equipment
    let gangId: string;
    
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
      // Get gang_id from vehicle
      const { data: vehicle, error: vehicleError } = await supabase
        .from('vehicles')
        .select('gang_id')
        .eq('id', equipmentData.vehicle_id)
        .single();
        
      if (vehicleError || !vehicle) {
        throw new Error('Vehicle not found for this equipment');
      }
      gangId = vehicle.gang_id;
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
        throw new Error('User does not have permission to move this equipment');
      }
    }

    // Update the equipment to move it to stash
    const { data: stashData, error: updateError } = await supabase
      .from('fighter_equipment')
      .update({
        fighter_id: null,
        vehicle_id: null,
        gang_stash: true
      })
      .eq('id', params.fighter_equipment_id)
      .select('id')
      .single();

    if (updateError || !stashData) {
      throw new Error(`Failed to move equipment to stash: ${updateError?.message || 'No data returned'}`);
    }

    // Invalidate appropriate caches - moving equipment to stash affects gang overview
    if (equipmentData.fighter_id) {
      invalidateFighterEquipment(equipmentData.fighter_id, gangId);
    } else if (equipmentData.vehicle_id) {
      // For vehicle equipment, we need to get the fighter_id from the vehicle
      const { data: vehicleData, error: vehicleError } = await supabase
        .from('vehicles')
        .select('fighter_id')
        .eq('id', equipmentData.vehicle_id)
        .single();
      
      if (!vehicleError && vehicleData?.fighter_id) {
        invalidateFighterEquipment(vehicleData.fighter_id, gangId);
        invalidateFighterVehicleData(vehicleData.fighter_id, gangId);
      }
      
      // Also invalidate vehicle-specific cache tags
      invalidateVehicleData(equipmentData.vehicle_id);
    }
    
    // Always invalidate gang overview to refresh stash display
    invalidateGangFinancials(gangId);
    
    // Also invalidate gang stash specifically
    invalidateGangStash({
      gangId: gangId,
      userId: user.id
    });

    return {
      success: true,
      data: {
        stash_id: stashData.id,
        equipment_moved: {
          id: equipmentData.id,
          fighter_id: equipmentData.fighter_id || undefined,
          vehicle_id: equipmentData.vehicle_id || undefined,
          equipment_id: equipmentData.equipment_id || undefined,
          custom_equipment_id: equipmentData.custom_equipment_id || undefined,
        }
      }
    };

  } catch (error) {
    console.error('Error in moveEquipmentToStash server action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}