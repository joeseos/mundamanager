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
    try {
      if (effectRow?.vehicle_id) {
        const [{ data: veh }, { data: fighter }] = await Promise.all([
          supabase.from('vehicles').select('fighter_id, vehicle_name').eq('id', effectRow.vehicle_id).single(),
          supabase.from('fighters').select('fighter_name').eq('id', params.fighterId).single()
        ]);
        if (veh) {
          vehicleName = veh.vehicle_name || 'Unknown Vehicle';
          if (veh.fighter_id) {
            const delta = -(effectRow?.type_specific_data?.credits_increase || 0);
            if (delta) {
              financialResult = await updateGangRatingSimple(supabase, params.gangId, delta);
            }
          }
        }
        fighterName = fighter?.fighter_name;
      }
    } catch (e) {
      console.error('Failed to update rating after removing vehicle damage:', e);
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

  // Lookup effect data and effect name before delete
    const { data: damageData } = await supabase
      .from("fighter_effects")
      .select("vehicle_id, type_specific_data, effect_name")
      .in("id", params.damageIds);

    // Fetch old financial values before the RPC call
    let oldFinancialValues: any = null;
    try {
      const { data: oldGang } = await supabase
        .from('gangs')
        .select('credits, rating, wealth')
        .eq('id', params.gangId)
        .single();
      
      if (oldGang) {
        oldFinancialValues = {
          credits: (oldGang.credits ?? 0) as number,
          rating: (oldGang.rating ?? 0) as number,
          wealth: (oldGang.wealth ?? 0) as number
        };
      }
    } catch (e) {
      console.error('Failed to fetch old financial values:', e);
    }

    // Calculate total credits_increase from removed damages for rating update
    let totalCreditsIncrease = 0;
    if (damageData) {
      totalCreditsIncrease = damageData.reduce((sum, d) => {
        const credits = (d.type_specific_data?.credits_increase || 0) as number;
        return sum + credits;
      }, 0);
    }

    // Call the repair RPC function (this updates credits directly in DB)
    const { error } = await supabase.rpc('repair_vehicle_damage', {
      damage_ids: params.damageIds,
      repair_cost: params.repairCost,
      in_user_id: user.id
    });
    
    if (error) {
      console.error('Error repairing vehicle damage:', error);
      throw new Error(error.message || 'Failed to repair vehicle damage');
    }

    // IMPORTANT: The RPC 'repair_vehicle_damage' already updates credits in the DB.
    // We call updateGangFinancials with creditsDelta: 0 to sync rating/wealth
    // without double-counting the credits change.
    // Rating change: +totalCreditsIncrease (damage removed from rating)
    // Credits change: -repairCost (already done by RPC)
    let financialResult: GangFinancialUpdateResult | null = null;
    let vehicleName = 'Unknown Vehicle';
    let fighterName: string | undefined;
    try {
      // Check if vehicle is assigned to an active fighter and get vehicle name
      const { data: vehicleData } = await supabase
        .from('vehicles')
        .select('fighter_id, vehicle_name')
        .eq('id', params.vehicleId)
        .single();
      
      if (vehicleData) {
        vehicleName = vehicleData.vehicle_name || 'Unknown Vehicle';
      }
      
      if (vehicleData?.fighter_id) {
        const { data: fighterData } = await supabase
          .from('fighters')
          .select('killed, retired, enslaved, captured, fighter_name')
          .eq('id', vehicleData.fighter_id)
          .single();
        
        const { countsTowardRating } = await import('@/utils/fighter-status');
        const isActive = countsTowardRating(fighterData);
        fighterName = fighterData?.fighter_name;
        
        if (isActive && totalCreditsIncrease > 0) {
          // Update rating (damage removed) and sync wealth
          // Credits were already updated by RPC, so we use creditsDelta: 0
          financialResult = await updateGangFinancials(supabase, {
            gangId: params.gangId,
            ratingDelta: totalCreditsIncrease,
            creditsDelta: 0 // Credits already updated by RPC, this syncs wealth
          });
        } else {
          // Just sync wealth without rating change
          financialResult = await updateGangFinancials(supabase, {
            gangId: params.gangId,
            creditsDelta: 0 // This syncs wealth based on current credits
          });
        }
      } else {
        // Vehicle not assigned, just sync wealth
        financialResult = await updateGangFinancials(supabase, {
          gangId: params.gangId,
          creditsDelta: 0
        });
      }
    } catch (e) {
      console.error('Failed to sync financials after repair:', e);
    }

    // Use old values from before RPC and new values from updateGangFinancials
    const finalOldValues = oldFinancialValues || financialResult?.oldValues;
    const finalNewValues = financialResult?.newValues;

    // Log vehicle damage repair
    try {
      const effectNames = damageData?.map(d => d.effect_name);
      if (effectNames) {
        const damageList = effectNames.length > 1
            ? effectNames.slice(0, -1).join(", ") + " and " + effectNames.slice(-1)
            : effectNames[0] ?? "";
          await logVehicleAction({
            gang_id: params.gangId,
            vehicle_id: params.vehicleId || '',
            vehicle_name: vehicleName, // Required: pass vehicle name
            fighter_id: params.fighterId,
            fighter_name: fighterName, // Optional: pass to avoid extra fetch
            damage_name: damageList.toLowerCase(),
            repair_type: params.repairType,
            cost: params.repairCost,
            action_type: 'vehicle_damage_repaired',
            user_id: user.id,
            oldCredits: finalOldValues?.credits,
            oldRating: finalOldValues?.rating,
            oldWealth: finalOldValues?.wealth,
            newCredits: finalNewValues?.credits,
            newRating: finalNewValues?.rating,
            newWealth: finalNewValues?.wealth
          });
      }

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