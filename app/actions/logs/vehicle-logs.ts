'use server'

import { createClient } from "@/utils/supabase/server";
import { createGangLog, GangLogActionResult } from "./gang-logs";
import { formatFinancialChanges } from "./log-helpers";

export interface VehicleLogParams {
  gang_id: string;
  vehicle_id: string;
  vehicle_name: string; // Required: always pass vehicle name (like fighter_name in FighterLogParams)
  fighter_id?: string;
  damage_name?: string;
  repair_type?: RepairCondition
  cost?: number;
  cost_multiplier?: number
  old_name?: string;
  fighter_name?: string; // Optional: pass to avoid extra fetch
  action_type: 'vehicle_damage_added' | 'vehicle_damage_removed' | 'vehicle_damage_repaired' | 'vehicle_unassigned' | 'vehicle_deleted' | 'vehicle_assigned' | 'vehicle_added' | 'vehicle_name_changed' | 'vehicle_sold';
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
    // Vehicle name is always required (like fighter_name in FighterLogParams)
    const vehicleName = params.vehicle_name;
    let fighterName = params.fighter_name || 'Unknown Fighter';

    // Fetch fighter name if not provided
    if (!params.fighter_name && params.fighter_id) {
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
      case 'vehicle_added':
        actionType = 'vehicle_added';
        const assignmentStatus = fighterName !== 'Unknown Fighter' ? ` assigned to "${fighterName}"` : ' (unassigned)';
        description = `Vehicle "${vehicleName}" added (${params.cost || 0} credits)${assignmentStatus}.${financialChanges}`;
        break;
      case 'vehicle_name_changed':
        actionType = 'vehicle_name_changed';
        description = `Vehicle name changed from "${params.old_name || 'Unknown'}" to "${vehicleName}".${financialChanges}`;
        break;
      case 'vehicle_sold':
        actionType = 'vehicle_sold';
        const soldContext = fighterName !== 'Unknown Fighter' ? ` (was assigned to "${fighterName}")` : ' (was unassigned)';
        description = `Vehicle "${vehicleName}" sold for ${params.cost || 0} credits${soldContext}.${financialChanges}`;
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