'use server'

import { createClient } from "@/utils/supabase/server";
import { createGangLog, GangLogActionResult } from "./gang-logs";
import { formatFinancialChanges } from "./log-helpers";

export interface VehicleLogParams {
  gang_id: string;
  vehicle_id: string;
  fighter_id?: string;
  damage_name?: string;
  repair_type?: RepairCondition
  cost?: number;
  cost_multiplier?: number
  action_type: 'vehicle_damage_added' | 'vehicle_damage_removed' | 'vehicle_damage_repaired' | 'vehicle_unassigned' | 'vehicle_deleted' | 'vehicle_assigned';
  user_id?: string;
  oldCredits?: number;
  oldRating?: number;
  oldWealth?: number;
  newCredits?: number;
  newRating?: number;
  newWealth?: number;
}

type RepairCondition = "Almost like new" | "Quality repairs" | "Superficial Damage";


export async function logVehicleAction(params: VehicleLogParams): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();

    // Get vehicle and fighter names for logging
    let vehicleName = 'Unknown Vehicle';
    let fighterName = 'Unknown Fighter';

    if (params.vehicle_id) {
      const { data: vehicle } = await supabase
        .from('vehicles')
        .select('vehicle_name')
        .eq('id', params.vehicle_id)
        .single();
      
      if (vehicle) vehicleName = vehicle.vehicle_name;
    }

    if (params.fighter_id) {
      const { data: fighter } = await supabase
        .from('fighters')
        .select('fighter_name')
        .eq('id', params.fighter_id)
        .single();
      
      if (fighter) fighterName = fighter.fighter_name;
    }

    // Format financial changes if provided
    let financialChanges = '';
    if (params.oldCredits !== undefined && params.newCredits !== undefined &&
        params.oldRating !== undefined && params.newRating !== undefined &&
        params.oldWealth !== undefined && params.newWealth !== undefined) {
      financialChanges = ' ' + formatFinancialChanges(
        params.oldCredits,
        params.newCredits,
        params.oldRating,
        params.newRating,
        params.oldWealth,
        params.newWealth
      );
    }

    // Determine action type and description
    let actionType: string;
    let description: string;

    switch (params.action_type) {
      case 'vehicle_damage_added':
        actionType = 'vehicle_damage_added';
        description = `Vehicle "${vehicleName}" (owned by ${fighterName}) sustained lasting damage: ${params.damage_name}.${financialChanges}`;
        break;
      case 'vehicle_damage_repaired':
        actionType = 'vehicle_damage_repaired';
        description = `Vehicle "${vehicleName}" (owned by ${fighterName}) has been repaired for ${params.cost}. This removed ${params.damage_name} and was negotiated to ${params.repair_type?.toString()}.${financialChanges}`;
        break;
      case 'vehicle_damage_removed':
        actionType = 'vehicle_damage_removed';
        description = `Vehicle "${vehicleName}" (owned by ${fighterName}) recovered from lasting damage: ${params.damage_name}.${financialChanges}`;
        break;
      case 'vehicle_unassigned':
        actionType = 'vehicle_unassigned';
        const unassignContext = fighterName !== 'Unknown Fighter' ? ` from "${fighterName}"` : '';
        description = `Vehicle "${vehicleName}" unassigned${unassignContext}.${financialChanges}`;
        break;
      case 'vehicle_deleted':
        actionType = 'vehicle_deleted';
        const deleteContext = fighterName !== 'Unknown Fighter' ? ` (was assigned to "${fighterName}")` : ' (was unassigned)';
        description = `Vehicle "${vehicleName}" deleted${deleteContext}.${financialChanges}`;
        break;
      case 'vehicle_assigned':
        actionType = 'vehicle_assigned';
        description = `Vehicle "${vehicleName}" assigned to "${fighterName}".${financialChanges}`;
        break;
      default:
        throw new Error(`Unknown vehicle action type: ${params.action_type}`);
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
    console.error('Error in logVehicleAction:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to log vehicle action'
    };
  }
}