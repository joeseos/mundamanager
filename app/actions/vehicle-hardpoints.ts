'use server'

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { invalidateVehicleEffects, invalidateGangFinancials, CACHE_TAGS } from '@/utils/cache-tags';
import { updateGangFinancials } from '@/utils/gang-rating-and-wealth';
import { revalidateTag } from 'next/cache';

// ============================================================================
// FIT WEAPON TO HARDPOINT
// ============================================================================

interface FitWeaponToHardpointParams {
  vehicleId: string;
  hardpointEffectId: string;   // fighter_effects row (the target hardpoint)
  weaponEquipmentId: string;   // fighter_equipment_id of weapon; empty string = unfit
  gangId: string;
}

export async function fitWeaponToHardpoint(
  params: FitWeaponToHardpointParams
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    // --- Load vehicle + gang ownership ---
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('id, fighter_id, gang_id')
      .eq('id', params.vehicleId)
      .single();
    if (!vehicle) return { success: false, error: 'Vehicle not found' };
    if (vehicle.gang_id !== params.gangId)
      return { success: false, error: 'Vehicle does not belong to this gang' };

    // --- Verify target hardpoint belongs to this vehicle ---
    const { data: targetHardpoint } = await supabase
      .from('fighter_effects')
      .select('id, fighter_equipment_id')
      .eq('id', params.hardpointEffectId)
      .eq('vehicle_id', params.vehicleId)
      .single();
    if (!targetHardpoint) return { success: false, error: 'Hardpoint not found on this vehicle' };

    if (params.weaponEquipmentId) {
      // === FIT ===
      // Verify weapon belongs to this vehicle
      const { data: weapon } = await supabase
        .from('fighter_equipment')
        .select('id')
        .eq('id', params.weaponEquipmentId)
        .eq('vehicle_id', params.vehicleId)
        .single();
      if (!weapon) return { success: false, error: 'Weapon not found on this vehicle' };

      // Auto-clear: if this weapon is already on another hardpoint, NULL that FK
      await supabase
        .from('fighter_effects')
        .update({ fighter_equipment_id: null })
        .eq('fighter_equipment_id', params.weaponEquipmentId)
        .eq('vehicle_id', params.vehicleId)
        .neq('id', params.hardpointEffectId);

      // Set weapon on target hardpoint
      await supabase
        .from('fighter_effects')
        .update({ fighter_equipment_id: params.weaponEquipmentId })
        .eq('id', params.hardpointEffectId);

    } else {
      // === UNFIT ===
      await supabase
        .from('fighter_effects')
        .update({ fighter_equipment_id: null })
        .eq('id', params.hardpointEffectId);
    }

    // --- Invalidate ---
    invalidateVehicleEffects(params.vehicleId, vehicle.fighter_id || undefined, params.gangId);

    return { success: true };
  } catch (error) {
    console.error('Error in fitWeaponToHardpoint:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================================================
// UPDATE VEHICLE HARDPOINT (arcs, operated_by)
// ============================================================================

interface UpdateVehicleHardpointParams {
  vehicleId: string;
  effectId: string;
  gangId: string;
  operated_by: 'crew' | 'passenger';
  arcs: string[];
}

export async function updateVehicleHardpoint(
  params: UpdateVehicleHardpointParams
): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    // --- Validate arcs ---
    const validArcs = ['Front', 'Left', 'Right', 'Rear'];
    const uniqueArcs = Array.from(new Set(params.arcs)).filter(a => validArcs.includes(a));
    if (uniqueArcs.length === 0) return { success: false, error: 'At least one arc is required' };

    // --- Load vehicle (for fighter_id and gang ownership check) ---
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('id, fighter_id, gang_id')
      .eq('id', params.vehicleId)
      .single();
    if (!vehicle) return { success: false, error: 'Vehicle not found' };

    // --- Security: verify vehicle belongs to the specified gang ---
    if (vehicle.gang_id !== params.gangId) {
      return { success: false, error: 'Vehicle does not belong to this gang' };
    }

    // --- Load current hardpoint effect (security: must belong to this vehicle) ---
    const { data: currentEffect } = await supabase
      .from('fighter_effects')
      .select('id, type_specific_data')
      .eq('id', params.effectId)
      .eq('vehicle_id', params.vehicleId)
      .single();
    if (!currentEffect) return { success: false, error: 'Hardpoint not found on this vehicle' };

    const currentData = (currentEffect.type_specific_data || {}) as Record<string, any>;

    // --- Cost delta ---
    // default_arcs is the template baseline stored at creation. Never changes.
    // Cost = arcs beyond the free baseline, at 15 credits each.
    const defaultArcsCount: number = (currentData.default_arcs || []).length;
    const currentCreditsIncrease: number = currentData.credits_increase || 0;
    const newCreditsIncrease = Math.max(0, uniqueArcs.length - defaultArcsCount) * 15;
    const delta = newCreditsIncrease - currentCreditsIncrease;  // positive = buying, negative = refund

    // --- Pre-flight credit check (updateGangFinancials clamps to 0, doesn't fail) ---
    if (delta > 0) {
      const { data: gang } = await supabase
        .from('gangs')
        .select('credits')
        .eq('id', params.gangId)
        .single();
      if (!gang || gang.credits < delta) {
        return { success: false, error: `Not enough credits. Required: ${delta}, Available: ${gang?.credits || 0}` };
      }
    }

    // --- Financial update ---
    if (delta !== 0) {
      // Assigned vehicle → ratingDelta (vehicle cost rolls into fighter rating)
      // Unassigned       → stashValueDelta (vehicle sits in gang stash)
      await updateGangFinancials(supabase, {
        gangId: params.gangId,
        creditsDelta: -delta,
        ...(vehicle.fighter_id
          ? { ratingDelta: delta }
          : { stashValueDelta: delta }),
      });
    }

    // --- Persist (spread currentData to preserve default_arcs) ---
    await supabase
      .from('fighter_effects')
      .update({
        type_specific_data: {
          ...currentData,
          operated_by: params.operated_by,
          arcs: uniqueArcs,
          credits_increase: newCreditsIncrease
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', params.effectId);

    // --- Invalidate ---
    invalidateVehicleEffects(params.vehicleId, vehicle.fighter_id || undefined, params.gangId);
    if (delta !== 0) invalidateGangFinancials(params.gangId);
    revalidateTag(CACHE_TAGS.BASE_GANG_VEHICLES(params.gangId));

    return {
      success: true,
      data: {
        effectId: params.effectId,
        operated_by: params.operated_by,
        arcs: uniqueArcs,
        credits_increase: newCreditsIncrease
      }
    };
  } catch (error) {
    console.error('Error in updateVehicleHardpoint:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
