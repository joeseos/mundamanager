'use server'

import { createClient } from '@/utils/supabase/server';
import { invalidateVehicleEffects, invalidateVehicleRepair, invalidateGangRating } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';
import { logVehicleAction } from './logs/vehicle-logs';

interface RemoveVehicleDamageParams {
  damageId: string;
  fighterId: string;
  gangId: string;
}

interface RemoveVehicleDamageResult {
  success: boolean;
  error?: string;
}

interface RepairVehicleDamageParams {
  damageIds: string[];
  repairCost: number;
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

    // Adjust rating if assigned
    try {
      if (effectRow?.vehicle_id) {
        const { data: veh } = await supabase
          .from('vehicles')
          .select('fighter_id')
          .eq('id', effectRow.vehicle_id)
          .single();
        if (veh?.fighter_id) {
          const delta = -(effectRow?.type_specific_data?.credits_increase || 0);
          if (delta) {
            const { data: ratingRow } = await supabase
              .from('gangs')
              .select('rating')
              .eq('id', params.gangId)
              .single();
            const currentRating = (ratingRow?.rating ?? 0) as number;
            await supabase
              .from('gangs')
              .update({ rating: Math.max(0, currentRating + delta) })
              .eq('id', params.gangId);
            invalidateGangRating(params.gangId);
          }
        }
      }
    } catch (e) {
      console.error('Failed to update rating after removing vehicle damage:', e);
    }

    // Log vehicle damage removal
    try {
      await logVehicleAction({
        gang_id: params.gangId,
        vehicle_id: effectRow?.vehicle_id || '',
        fighter_id: params.fighterId,
        damage_name: effectRow?.effect_name || 'Unknown damage',
        action_type: 'vehicle_damage_removed',
        user_id: user.id
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

    // Call the repair RPC function
    const { error } = await supabase.rpc('repair_vehicle_damage', {
      damage_ids: params.damageIds,
      repair_cost: params.repairCost,
      in_user_id: user.id
    });
    
    if (error) {
      console.error('Error repairing vehicle damage:', error);
      throw new Error(error.message || 'Failed to repair vehicle damage');
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