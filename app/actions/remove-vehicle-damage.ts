'use server'

import { createClient } from '@/utils/supabase/server';
import { invalidateVehicleEffects, invalidateVehicleRepair } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';
import { logVehicleAction } from './logs/vehicle-logs';
import { updateGangRatingSimple, updateGangFinancials, GangFinancialUpdateResult } from '@/utils/gang-rating-and-wealth';

interface RemoveVehicleDamageParams {
  damageId: string;
  fighterId: string;
  gangId: string;
}

interface RemoveVehicleDamageResult {
  success: boolean;
  error?: string;
}
type RepairCondition = "Almost like new" | "Quality repairs" | "Superficial Damage";


interface RepairVehicleDamageParams {
  damageIds: string[];
  repairCost: number;
  repairType: RepairCondition
  vehicleId: string;
  fighterId: string;
  gangId: string;
}

interface RepairVehicleDamageResult {
  success: boolean;
  error?: string;
}

export async function removeVehicleDamage(params: RemoveVehicleDamageParams): Promise<RemoveVehicleDamageResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Lookup effect data and effect namebefore delete
    const { data: effectRow } = await supabase
      .from('fighter_effects')
      .select('vehicle_id, type_specific_data, effect_name')
      .eq('id', params.damageId)
      .single();

    // Remove the vehicle damage
    const { error } = await supabase
      .from('fighter_effects')
      .delete()
      .eq('id', params.damageId);

    if (error) {
      console.error('Error removing vehicle damage:', error);
      throw new Error(error.message || 'Failed to remove vehicle damage');
    }

    // Adjust rating if assigned and fetch vehicle name
    let financialResult: GangFinancialUpdateResult | null = null;
    let vehicleName = 'Unknown Vehicle';
    let fighterName: string | undefined;
    let ratingDelta = 0;
    try {
      if (effectRow?.vehicle_id) {
        const [{ data: veh }, { data: fighter }] = await Promise.all([
          supabase.from('vehicles').select('fighter_id, vehicle_name').eq('id', effectRow.vehicle_id).single(),
          supabase.from('fighters').select('fighter_name').eq('id', params.fighterId).single()
        ]);
        if (veh) {
          vehicleName = veh.vehicle_name || 'Unknown Vehicle';
          if (veh.fighter_id) {
            ratingDelta = -(effectRow?.type_specific_data?.credits_increase || 0);
          }
        }
        fighterName = fighter?.fighter_name;
      }
    } catch (e) {
      console.error('Failed to fetch vehicle/fighter data:', e);
    }

    // Financial update outside try/catch so CAS failures propagate
    if (ratingDelta) {
      financialResult = await updateGangRatingSimple(supabase, params.gangId, ratingDelta);
      if (!financialResult.success) throw new Error(financialResult.error || 'Failed to update gang financials');
    }

    // Log vehicle damage removal
    try {
      await logVehicleAction({
        gang_id: params.gangId,
        vehicle_id: effectRow?.vehicle_id || '',
        vehicle_name: vehicleName, // Required: pass vehicle name
        fighter_id: params.fighterId,
        fighter_name: fighterName, // Optional: pass to avoid extra fetch
        damage_name: effectRow?.effect_name || 'Unknown damage',
        action_type: 'vehicle_damage_removed',
        user_id: user.id,
        oldCredits: financialResult?.oldValues?.credits,
        oldRating: financialResult?.oldValues?.rating,
        oldWealth: financialResult?.oldValues?.wealth,
        newCredits: financialResult?.newValues?.credits,
        newRating: financialResult?.newValues?.rating,
        newWealth: financialResult?.newValues?.wealth
      });
    } catch (logError) {
      console.error('Failed to log vehicle damage removal:', logError);
    }

    // Invalidate cache for vehicle effects
    if (effectRow?.vehicle_id) {
      invalidateVehicleEffects(effectRow.vehicle_id, params.fighterId, params.gangId);
    }

    return {
      success: true
    };
  } catch (error) {
    console.error('Error in removeVehicleDamage:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function repairVehicleDamage(params: RepairVehicleDamageParams): Promise<RepairVehicleDamageResult> {
  try {
    const supabase = await createClient();

    // Get the current user
    const user = await getAuthenticatedUser(supabase);

    // Parameter validation
    if (!params.damageIds || params.damageIds.length === 0) {
      throw new Error('damageIds must be provided');
    }
    if (params.repairCost === undefined || params.repairCost === null) {
      throw new Error('repairCost must be provided');
    }

    // Fetch all required data in parallel BEFORE any mutations
    const [damageResult, gangResult, vehicleResult] = await Promise.all([
      supabase
        .from('fighter_effects')
        .select('id, vehicle_id, type_specific_data, effect_name')
        .in('id', params.damageIds),
      supabase
        .from('gangs')
        .select('id, credits, rating, wealth')
        .eq('id', params.gangId)
        .single(),
      supabase
        .from('vehicles')
        .select('id, fighter_id, vehicle_name')
        .eq('id', params.vehicleId)
        .single()
    ]);

    const damageData = damageResult.data;
    const gang = gangResult.data;
    const vehicleData = vehicleResult.data;

    if (!damageData || damageData.length === 0) {
      throw new Error('Damage effects not found');
    }
    if (!gang) {
      throw new Error('Gang not found');
    }

    // Note: Authorization is enforced by RLS policies on fighter_effects and gangs tables

    // Pre-flight credit check
    if (params.repairCost > 0 && gang.credits < params.repairCost) {
      throw new Error(`Not enough credits to repair damage. Required: ${params.repairCost}, Available: ${gang.credits}`);
    }

    // Calculate total credits_increase from removed damages for rating update
    const totalCreditsIncrease = damageData.reduce((sum, d) => {
      const credits = (d.type_specific_data?.credits_increase || 0) as number;
      return sum + credits;
    }, 0);

    // Determine if vehicle is assigned to an active fighter
    let isAssignedToActiveFighter = false;
    let fighterName: string | undefined;
    const vehicleName = vehicleData?.vehicle_name || 'Unknown Vehicle';

    if (vehicleData?.fighter_id) {
      const { data: fighterData } = await supabase
        .from('fighters')
        .select('killed, retired, enslaved, captured, fighter_name')
        .eq('id', vehicleData.fighter_id)
        .single();

      const { countsTowardRating } = await import('@/utils/fighter-status');
      isAssignedToActiveFighter = countsTowardRating(fighterData);
      fighterName = fighterData?.fighter_name;
    }

    // Delete all damage effects (RLS enforces authorization)
    const { error: deleteError } = await supabase
      .from('fighter_effects')
      .delete()
      .in('id', params.damageIds);

    if (deleteError) {
      console.error('Error deleting vehicle damages:', deleteError);
      throw new Error(`Failed to delete vehicle damages: ${deleteError.message}`);
    }

    // Calculate financial deltas
    // - creditsDelta: -repairCost (spending credits)
    // - ratingDelta: +totalCreditsIncrease if vehicle is assigned to active fighter
    //   (removing damage removes its credits_increase from rating)
    let ratingDelta = 0;
    if (isAssignedToActiveFighter && totalCreditsIncrease > 0) {
      ratingDelta = totalCreditsIncrease;
    }

    const financialResult = await updateGangFinancials(supabase, {
      gangId: params.gangId,
      creditsDelta: -params.repairCost,
      ratingDelta,
      applyToRating: isAssignedToActiveFighter
    });

    if (!financialResult.success) {
      // Note: Damage deletion already succeeded - consider this a partial failure
      console.error('Failed to update gang financials after repair:', financialResult.error);
      throw new Error(financialResult.error || 'Failed to update gang financials');
    }

    // Log vehicle damage repair
    try {
      const effectNames = damageData.map(d => d.effect_name);
      const damageList = effectNames.length > 1
        ? effectNames.slice(0, -1).join(', ') + ' and ' + effectNames.slice(-1)
        : effectNames[0] ?? '';

      await logVehicleAction({
        gang_id: params.gangId,
        vehicle_id: params.vehicleId,
        vehicle_name: vehicleName,
        fighter_id: vehicleData?.fighter_id,
        fighter_name: fighterName,
        damage_name: damageList.toLowerCase(),
        repair_type: params.repairType,
        cost: params.repairCost,
        action_type: 'vehicle_damage_repaired',
        user_id: user.id,
        oldCredits: financialResult.oldValues?.credits,
        oldRating: financialResult.oldValues?.rating,
        oldWealth: financialResult.oldValues?.wealth,
        newCredits: financialResult.newValues?.credits,
        newRating: financialResult.newValues?.rating,
        newWealth: financialResult.newValues?.wealth
      });
    } catch (logError) {
      console.error('Failed to log vehicle damage repair:', logError);
    }

    // Invalidate cache for vehicle effects and gang credits
    invalidateVehicleRepair(params.vehicleId, params.fighterId, params.gangId);

    return {
      success: true
    };
  } catch (error) {
    console.error('Error in repairVehicleDamage:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
} 