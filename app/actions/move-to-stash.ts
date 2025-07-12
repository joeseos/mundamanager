'use server';

import { createClient } from '@/utils/supabase/server';
import { checkAdmin } from '@/utils/auth';
import {
  invalidateFighterData,
  invalidateVehicleData,
  invalidateGangFinancials,
} from '@/utils/cache-tags';

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

export async function moveEquipmentToStash(
  params: MoveToStashParams
): Promise<MoveToStashResult> {
  const supabase = await createClient();

  try {
    // Get the current user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('User not authenticated');
    }

    // Check if user is an admin
    const isAdmin = await checkAdmin(supabase);

    // Get the equipment data first
    const { data: equipmentData, error: equipmentError } = await supabase
      .from('fighter_equipment')
      .select(
        `
        id,
        fighter_id,
        vehicle_id,
        equipment_id,
        custom_equipment_id,
        purchase_cost,
        original_cost,
        is_master_crafted
      `
      )
      .eq('id', params.fighter_equipment_id)
      .single();

    if (equipmentError || !equipmentData) {
      console.error('Equipment lookup error:', equipmentError);
      console.error('Looking for equipment ID:', params.fighter_equipment_id);
      throw new Error(
        `Fighter equipment with ID ${params.fighter_equipment_id} not found. Error: ${equipmentError?.message || 'No data returned'}`
      );
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

    // Start database transaction by inserting into gang_stash first
    const { data: stashData, error: stashInsertError } = await supabase
      .from('gang_stash')
      .insert({
        gang_id: gangId,
        equipment_id: equipmentData.equipment_id,
        custom_equipment_id: equipmentData.custom_equipment_id,
        cost: equipmentData.purchase_cost,
        is_master_crafted: equipmentData.is_master_crafted || false,
      })
      .select('id')
      .single();

    if (stashInsertError || !stashData) {
      throw new Error(
        `Failed to insert equipment into gang stash: ${stashInsertError?.message || 'No data returned'}`
      );
    }

    // Delete from fighter_equipment (this completes the move operation)
    const { error: deleteError } = await supabase
      .from('fighter_equipment')
      .delete()
      .eq('id', params.fighter_equipment_id);

    if (deleteError) {
      // If delete fails, we should try to rollback the stash insert
      // Note: Supabase doesn't support transactions in the JS client, so we manually clean up
      await supabase.from('gang_stash').delete().eq('id', stashData.id);

      throw new Error(
        `Failed to delete equipment from fighter: ${deleteError.message}`
      );
    }

    // Invalidate appropriate caches - moving equipment to stash affects gang overview
    if (equipmentData.fighter_id) {
      invalidateFighterData(equipmentData.fighter_id, gangId);
    } else if (equipmentData.vehicle_id) {
      // For vehicle equipment, we need to get the fighter_id from the vehicle
      const { data: vehicleData, error: vehicleError } = await supabase
        .from('vehicles')
        .select('fighter_id')
        .eq('id', equipmentData.vehicle_id)
        .single();

      if (!vehicleError && vehicleData?.fighter_id) {
        invalidateFighterData(vehicleData.fighter_id, gangId);
      }

      // Also invalidate vehicle-specific cache tags
      invalidateVehicleData(equipmentData.vehicle_id);
    }

    // Always invalidate gang overview to refresh stash display
    invalidateGangFinancials(gangId);

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
        },
      },
    };
  } catch (error) {
    console.error('Error in moveEquipmentToStash server action:', error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unknown error occurred',
    };
  }
}
