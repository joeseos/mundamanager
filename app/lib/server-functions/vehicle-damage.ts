'use server'

import { createClient } from "@/utils/supabase/server";
import { getAuthenticatedUser } from "@/utils/auth";

// Type-safe server function patterns for Next.js + TanStack Query integration
export type ServerFunctionResult<T = unknown> = {
  success: true
  data: T
} | {
  success: false
  error: string
}

export interface ServerFunctionContext {
  user: any  // AuthUser type from supabase
  supabase: any
}

// Helper function to create server function context
async function createServerContext(): Promise<ServerFunctionContext> {
  const supabase = await createClient()
  const user = await getAuthenticatedUser(supabase)
  
  return {
    user,
    supabase
  }
}

// Vehicle damage operation types
export interface AddVehicleDamageParams {
  vehicleId: string;
  fighterId: string;
  gangId: string;
  damageId: string;
  damageName: string;
}

export interface RemoveVehicleDamageParams {
  damageId: string;
  fighterId: string;
  gangId: string;
}

export interface VehicleDamage {
  id: string;
  effect_name: string;
  fighter_effect_type_id: string;
  type_specific_data: any;
  created_at: string;
}

// Add damage to a vehicle
export async function addVehicleDamage(
  params: AddVehicleDamageParams
): Promise<ServerFunctionResult<VehicleDamage>> {
  try {
    const { user, supabase } = await createServerContext()

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
    try {
      const [{ data: veh }, { data: eff }] = await Promise.all([
        supabase.from('vehicles').select('fighter_id').eq('id', params.vehicleId).single(),
        supabase.from('fighter_effect_types').select('type_specific_data').eq('id', params.damageId).single()
      ]);
      
      if (veh?.fighter_id) {
        const delta = (eff?.type_specific_data?.credits_increase || 0) as number;
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
        }
      }
    } catch (e) {
      console.error('Failed to update rating for vehicle damage:', e);
    }

    // Log vehicle damage action
    try {
      const { logVehicleAction } = await import('@/app/actions/logs/vehicle-logs');
      await logVehicleAction({
        gang_id: params.gangId,
        vehicle_id: params.vehicleId,
        fighter_id: params.fighterId,
        damage_name: params.damageName,
        action_type: 'vehicle_damage_added',
        user_id: user.id
      });
    } catch (logError) {
      console.error('Failed to log vehicle damage action:', logError);
    }

    // Return the complete damage data with proper structure for optimistic updates
    // The RPC should return the created effect with all its relationships
    const createdDamage = {
      id: data.id,
      effect_name: data.effect_name || params.damageName,
      fighter_effect_type_id: params.damageId,
      fighter_effect_modifiers: data.fighter_effect_modifiers || [],
      type_specific_data: data.type_specific_data,
      created_at: data.created_at || new Date().toISOString()
    };

    return {
      success: true,
      data: createdDamage
    };
  } catch (error) {
    console.error('Error in addVehicleDamage:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// Remove damage from a vehicle
export async function removeVehicleDamage(
  params: RemoveVehicleDamageParams
): Promise<ServerFunctionResult<null>> {
  try {
    const { user, supabase } = await createServerContext()

    // Check if this is a temporary ID from optimistic updates
    if (params.damageId.startsWith('temp-damage-')) {
      // This is an optimistic update being rolled back, just return success
      return {
        success: true,
        data: null
      };
    }

    // Lookup effect data and effect name before delete
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
          }
        }
      }
    } catch (e) {
      console.error('Failed to update rating after removing vehicle damage:', e);
    }

    // Log vehicle damage removal
    try {
      const { logVehicleAction } = await import('@/app/actions/logs/vehicle-logs');
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

    return {
      success: true,
      data: null
    };
  } catch (error) {
    console.error('Error in removeVehicleDamage:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}