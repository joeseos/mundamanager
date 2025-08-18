'use server'

import { createClient } from "@/utils/supabase/server";
import { createGangLog, GangLogActionResult } from "./gang-logs";

export interface EquipmentLogParams {
  gang_id: string;
  fighter_id?: string;
  vehicle_id?: string;
  equipment_name: string;
  purchase_cost: number;
  action_type: 'purchased' | 'sold' | 'moved_from_stash' | 'moved_to_stash';
  user_id?: string;
}

export async function logEquipmentAction(params: EquipmentLogParams): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();
    
    // Get current gang rating
    const { data: gangData, error: ratingError } = await supabase
      .from('gangs')
      .select('rating')
      .eq('id', params.gang_id)
      .single();

    if (ratingError) {
      console.error('Error fetching gang rating:', ratingError);
    }

    const newGangRating = gangData?.rating || 0;

    // Get fighter/vehicle names for logging
    let fighterName = 'Unknown Fighter';
    let vehicleName = 'Unknown Vehicle';

    if (params.fighter_id) {
      const { data: fighter } = await supabase
        .from('fighters')
        .select('fighter_name')
        .eq('id', params.fighter_id)
        .single();
      
      if (fighter) fighterName = fighter.fighter_name;
    }

    if (params.vehicle_id) {
      const { data: vehicle } = await supabase
        .from('vehicles')
        .select('vehicle_name')
        .eq('id', params.vehicle_id)
        .single();
      
      if (vehicle) vehicleName = vehicle.vehicle_name;
    }

    // Determine action type and description
    let actionType: string;
    let description: string;

    const isVehicleEquipment = !!params.vehicle_id;
    const isStashPurchase = !params.fighter_id && !params.vehicle_id;
    
    const targetName = isVehicleEquipment ? vehicleName : fighterName;
    const targetType = isVehicleEquipment ? 'Vehicle' : 'Fighter';

    switch (params.action_type) {
      case 'purchased':
        if (isStashPurchase) {
          actionType = 'equipment_purchased_to_stash';
          description = `Gang purchased ${params.equipment_name} directly to stash for ${params.purchase_cost} credits. New gang rating: ${newGangRating}`;
        } else {
          actionType = isVehicleEquipment ? 'vehicle_equipment_purchased' : 'equipment_purchased';
          description = `${targetType} "${targetName}" bought ${params.equipment_name} for ${params.purchase_cost} credits. New gang rating: ${newGangRating}`;
        }
        break;
      case 'sold':
        actionType = isVehicleEquipment ? 'vehicle_equipment_sold' : 'equipment_sold';
        description = `${targetType} "${targetName}" sold ${params.equipment_name} for ${params.purchase_cost} credits. New gang rating: ${newGangRating}`;
        break;
      case 'moved_from_stash':
        actionType = isVehicleEquipment ? 'vehicle_equipment_moved_from_stash' : 'equipment_moved_from_stash';
        description = `${targetType} "${targetName}" took ${params.equipment_name} (${params.purchase_cost} credits) from gang stash. New gang rating: ${newGangRating}`;
        break;
      case 'moved_to_stash':
        actionType = isVehicleEquipment ? 'vehicle_equipment_moved_to_stash' : 'equipment_moved_to_stash';
        description = `${targetType} "${targetName}" moved ${params.equipment_name} (${params.purchase_cost} credits) to gang stash. New gang rating: ${newGangRating}`;
        break;
      default:
        throw new Error(`Unknown action type: ${params.action_type}`);
    }

    return await createGangLog({
      gang_id: params.gang_id,
      action_type: actionType,
      description: description,
      fighter_id: params.fighter_id,
      vehicle_id: params.vehicle_id,
      user_id: params.user_id
    });

  } catch (error) {
    console.error('Error in logEquipmentAction:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to log equipment action'
    };
  }
}

// Helper function to check if equipment move is from/to stash
export async function checkEquipmentInStash(
  gang_id: string, 
  equipment_id?: string, 
  custom_equipment_id?: string, 
  cost?: number
): Promise<boolean> {
  try {
    const supabase = await createClient();
    
    let query = supabase
      .from('gang_stash')
      .select('id')
      .eq('gang_id', gang_id)
      .eq('cost', cost || 0);

    // Build the OR condition properly handling null values
    if (equipment_id && custom_equipment_id) {
      query = query.or(`equipment_id.eq.${equipment_id},custom_equipment_id.eq.${custom_equipment_id}`);
    } else if (equipment_id) {
      query = query.eq('equipment_id', equipment_id);
    } else if (custom_equipment_id) {
      query = query.eq('custom_equipment_id', custom_equipment_id);
    } else {
      // Neither equipment_id nor custom_equipment_id provided
      return false;
    }

    const { data, error } = await query.limit(1);

    if (error) {
      console.error('Error checking stash:', error);
      return false;
    }

    return data && data.length > 0;
  } catch (error) {
    console.error('Error in checkEquipmentInStash:', error);
    return false;
  }
}