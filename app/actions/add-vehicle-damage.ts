'use server'

import { createClient } from '@/utils/supabase/server';
import { invalidateVehicleEffects } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';
import { logVehicleAction, logRolledVehicleDamage } from './logs/vehicle-logs';
import type { GangLogActionResult } from './logs/gang-logs';
import { updateGangRatingSimple, GangFinancialUpdateResult } from '@/utils/gang-rating-and-wealth';

export interface VerifyAndLogRolledVehicleDamageParams {
  vehicle_id: string;
  fighter_id: string;
  gang_id: string;
  damage_type_id: string;
  damage_table: string;
  dice_data: { result: number };
}

export async function verifyAndLogRolledVehicleDamage(
  params: VerifyAndLogRolledVehicleDamageParams
): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .select('id, vehicle_name, fighter_id')
      .eq('id', params.vehicle_id)
      .single();

    if (vehicleError || !vehicle) {
      throw new Error('Vehicle not found');
    }

    const { data: damageType, error: damageError } = await supabase
      .from('fighter_effect_types')
      .select('id, effect_name')
      .eq('id', params.damage_type_id)
      .single();

    if (damageError || !damageType) {
      throw new Error('Damage type not found');
    }

    let fighterName: string | undefined;
    const { data: fighter } = await supabase
      .from('fighters')
      .select('fighter_name')
      .eq('id', params.fighter_id)
      .single();
    fighterName = fighter?.fighter_name;

    return await logRolledVehicleDamage({
      gang_id: params.gang_id,
      vehicle_id: params.vehicle_id,
      vehicle_name: vehicle.vehicle_name || 'Unknown Vehicle',
      fighter_id: params.fighter_id,
      fighter_name: fighterName,
      damage_name: damageType.effect_name,
      damage_table: params.damage_table,
      dice_data: params.dice_data
    });
  } catch (error) {
    console.error('Failed to log vehicle damage roll:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

interface AddVehicleDamageParams {
  vehicleId: string;
  fighterId: string;
  gangId: string;
  damageId: string;
  damageName: string;
}

interface AddVehicleDamageResult {
  success: boolean;
  data?: any;
  error?: string;
}

export async function addVehicleDamage(params: AddVehicleDamageParams): Promise<AddVehicleDamageResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Add the vehicle damage using the RPC function
    const { data, error } = await supabase
      .rpc('add_vehicle_effect', {
        in_vehicle_id: params.vehicleId,
        in_fighter_effect_type_id: params.damageId,
        in_user_id: user.id,
        in_fighter_effect_category_id: 'a993261a-4172-4afb-85bf-f35e78a1189f' // VEHICLE_DAMAGE_CATEGORY_ID
      });

    if (error) {
      console.error('Error adding vehicle damage:', error);
      throw new Error(error.message || 'Failed to add vehicle damage');
    }

    // Fetch effect credits_increase and update rating if vehicle is assigned
    let financialResult: GangFinancialUpdateResult | null = null;
    let vehicleName = 'Unknown Vehicle';
    let fighterName: string | undefined;
    try {
      const [{ data: veh }, { data: eff }, { data: fighter }] = await Promise.all([
        supabase.from('vehicles').select('fighter_id, vehicle_name').eq('id', params.vehicleId).single(),
        supabase.from('fighter_effect_types').select('type_specific_data').eq('id', params.damageId).single(),
        supabase.from('fighters').select('fighter_name').eq('id', params.fighterId).single()
      ]);
      if (veh) {
        vehicleName = veh.vehicle_name || 'Unknown Vehicle';
        if (veh.fighter_id) {
          const delta = (eff?.type_specific_data?.credits_increase || 0) as number;
          if (delta) {
            financialResult = await updateGangRatingSimple(supabase, params.gangId, delta);
          }
        }
      }
      fighterName = fighter?.fighter_name;
    } catch (e) {
      console.error('Failed to update rating for vehicle damage:', e);
    }

    // Log vehicle damage action
    try {
      await logVehicleAction({
        gang_id: params.gangId,
        vehicle_id: params.vehicleId,
        vehicle_name: vehicleName, // Required: pass vehicle name
        fighter_id: params.fighterId,
        fighter_name: fighterName, // Optional: pass to avoid extra fetch
        damage_name: params.damageName,
        action_type: 'vehicle_damage_added',
        user_id: user.id,
        oldCredits: financialResult?.oldValues?.credits,
        oldRating: financialResult?.oldValues?.rating,
        oldWealth: financialResult?.oldValues?.wealth,
        newCredits: financialResult?.newValues?.credits,
        newRating: financialResult?.newValues?.rating,
        newWealth: financialResult?.newValues?.wealth
      });
    } catch (logError) {
      console.error('Failed to log vehicle damage action:', logError);
    }

    // Invalidate cache for vehicle effects
    invalidateVehicleEffects(params.vehicleId, params.fighterId, params.gangId);

    return {
      success: true,
      data
    };
  } catch (error) {
    console.error('Error in addVehicleDamage:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
} 