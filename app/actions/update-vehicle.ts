'use server'

import { createClient } from '@/utils/supabase/server';
import { invalidateFighterVehicleData, invalidateVehicleEffects } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';
import { logVehicleAction } from './logs/vehicle-logs';

interface UpdateVehicleParams {
  vehicleId: string;
  vehicleName: string;
  specialRules: string[];
  gangId: string;
  assignedFighterId?: string;
  statAdjustments?: Record<string, number>;
}

interface UpdateVehicleResult {
  success: boolean;
  data?: any;
  error?: string;
}

export async function updateVehicle(params: UpdateVehicleParams): Promise<UpdateVehicleResult> {
  try {
    const supabase = await createClient();

    // Get the current user with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Get current vehicle data to compare name
    const { data: currentVehicle, error: currentError } = await supabase
      .from('vehicles')
      .select('vehicle_name, fighter_id, gang_id')
      .eq('id', params.vehicleId)
      .single();

    if (currentError || !currentVehicle) {
      throw new Error('Vehicle not found');
    }

    const oldVehicleName = currentVehicle.vehicle_name;
    const nameChanged = oldVehicleName !== params.vehicleName.trimEnd();

    // Update the vehicle
    const { data, error } = await supabase
      .from('vehicles')
      .update({
        vehicle_name: params.vehicleName.trimEnd(),
        special_rules: params.specialRules,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.vehicleId)
      .select()
      .single();

    if (error) {
      console.error('Error updating vehicle:', error);
      throw new Error(error.message || 'Failed to update vehicle');
    }

    // Handle stat adjustments if provided (matching fighter implementation pattern)
    if (params.statAdjustments && Object.keys(params.statAdjustments).length > 0) {
      try {
        // Fetch effect types for the 'user' category (same as fighters)
        const USER_EFFECT_CATEGORY_ID = '3d582ae1-2c18-4e1a-93a9-0c7c5731a96a';
        const { data: effectTypes, error: typesError } = await supabase
          .from('fighter_effect_types')
          .select(`
            id,
            effect_name,
            fighter_effect_type_modifiers (
              id,
              stat_name,
              default_numeric_value
            )
          `)
          .eq('fighter_effect_category_id', USER_EFFECT_CATEGORY_ID);

        if (typesError) throw typesError;

        // Helper to find matching effect type for a stat and delta sign
        const findEffectTypeFor = (statName: string, delta: number) => {
          return (effectTypes as any[])?.find((et: any) =>
            et.fighter_effect_type_modifiers?.some((m: any) =>
              m.stat_name === statName && Math.sign(m.default_numeric_value) === Math.sign(delta)
            )
          );
        };

        let effectsChanged = false;
        for (const [statName, delta] of Object.entries(params.statAdjustments)) {
          const changeValue = Number(delta);
          if (!changeValue || changeValue === 0) continue;
          const effectType = findEffectTypeFor(statName, changeValue);
          if (!effectType) continue;

          // Create effect row
          const { data: newEffect, error: effectError } = await supabase
            .from('fighter_effects')
            .insert({
              vehicle_id: params.vehicleId,
              fighter_id: null,
              fighter_effect_type_id: effectType.id,
              effect_name: effectType.effect_name,
              user_id: user.id
            })
            .select('id')
            .single();

          if (effectError || !newEffect) {
            console.error('Error creating effect:', effectError);
            continue;
          }

          // Create modifier with the actual adjustment value (not the default)
          const modifier = effectType.fighter_effect_type_modifiers.find(
            (m: any) => Math.sign(m.default_numeric_value) === Math.sign(changeValue)
          );

          if (modifier) {
            const { error: modError } = await supabase
              .from('fighter_effect_modifiers')
              .insert({
                fighter_effect_id: newEffect.id,
                stat_name: modifier.stat_name,
                numeric_value: changeValue
              });

            if (modError) {
              console.error('Error creating modifier:', modError);
            } else {
              effectsChanged = true;
            }
          }
        }

        if (!effectsChanged) {
          console.warn('No stat adjustments were applied');
        } else if (params.assignedFighterId) {
          // Invalidate vehicle effects cache when effects are successfully applied
          invalidateVehicleEffects(params.vehicleId, params.assignedFighterId, params.gangId);
        }
      } catch (error) {
        console.error('Error applying stat adjustments:', error);
        // Don't throw - allow the vehicle update to succeed even if stat adjustments fail
      }
    }

    // Log name change if applicable
    if (nameChanged) {
      try {
        // Name changes don't affect financials, so we don't pass financial fields
        // This prevents them from being displayed in the log description
        await logVehicleAction({
          gang_id: currentVehicle.gang_id,
          vehicle_id: params.vehicleId,
          vehicle_name: params.vehicleName.trimEnd(), // Required: pass new vehicle name
          fighter_id: currentVehicle.fighter_id || undefined,
          action_type: 'vehicle_name_changed',
          old_name: oldVehicleName,
          user_id: user.id
          // Financial fields omitted - name changes don't affect financials
        });
      } catch (logError) {
        console.error('Failed to log vehicle name change:', logError);
        // Don't fail the main operation for logging errors
      }
    }

    // Invalidate cache for the fighter and gang if the vehicle was assigned to a fighter
    if (params.assignedFighterId) {
      invalidateFighterVehicleData(params.assignedFighterId, params.gangId);
    }

    return {
      success: true,
      data
    };

  } catch (error) {
    console.error('Error in updateVehicle server action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
} 