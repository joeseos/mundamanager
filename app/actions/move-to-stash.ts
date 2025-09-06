'use server'

import { createClient } from "@/utils/supabase/server";
import { checkAdminOptimized, getAuthenticatedUser } from "@/utils/auth";
// Cache invalidation now handled by TanStack Query client-side
// import { invalidateFighterData, invalidateFighterDataWithFinancials, invalidateFighterEquipment, invalidateVehicleData, invalidateGangFinancials, invalidateFighterVehicleData, invalidateGangStash, invalidateGangRating, invalidateFighterAdvancement } from '@/utils/cache-tags';
import { logEquipmentAction } from './logs/equipment-logs';

interface MoveToStashParams {
  fighter_equipment_id: string;
}

interface MoveToStashResult {
  success: boolean;
  data?: {
    stash_id: string;
    equipment_moved: {
      id: string;
      fighter_id?: string;
      vehicle_id?: string;
      equipment_id?: string;
      custom_equipment_id?: string;
    };
    removed_effects?: Array<{
      id: string;
      effect_name: string;
      fighter_effect_modifiers: Array<{
        stat_name: string;
        numeric_value: number;
      }>;
    }>;
  };
  error?: string;
}

export async function moveEquipmentToStash(params: MoveToStashParams): Promise<MoveToStashResult> {
  const supabase = await createClient();
  
  try {
    // Get the current user with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Check if user is an admin (optimized)
    const isAdmin = await checkAdminOptimized(supabase, user);
    
    // Get the equipment data first
    const { data: equipmentData, error: equipmentError } = await supabase
      .from('fighter_equipment')
      .select(`
        id,
        fighter_id,
        vehicle_id,
        equipment_id,
        custom_equipment_id,
        purchase_cost,
        original_cost,
        is_master_crafted
      `)
      .eq('id', params.fighter_equipment_id)
      .single();

    if (equipmentError || !equipmentData) {
      console.error('Equipment lookup error:', equipmentError);
      console.error('Looking for equipment ID:', params.fighter_equipment_id);
      throw new Error(`Fighter equipment with ID ${params.fighter_equipment_id} not found. Error: ${equipmentError?.message || 'No data returned'}`);
    }

    // Get associated fighter effects before moving to stash (they need to be removed)
    const { data: associatedEffects } = await supabase
      .from('fighter_effects')
      .select(`
        id,
        effect_name,
        type_specific_data,
        fighter_effect_modifiers (
          stat_name,
          numeric_value
        )
      `)
      .eq('fighter_equipment_id', params.fighter_equipment_id);

    // Determine the gang_id based on whether it's fighter or vehicle equipment
    let gangId: string;
    let vehicleAssigned = false;
    
    if (equipmentData.fighter_id) {
      // Get gang_id from fighter
      const { data: fighter, error: fighterError } = await supabase
        .from('fighters')
        .select('gang_id')
        .eq('id', equipmentData.fighter_id)
        .single();
        
      if (fighterError || !fighter) {
        throw new Error('Fighter not found for this equipment');
      }
      gangId = fighter.gang_id;
    } else if (equipmentData.vehicle_id) {
      // Get gang_id from vehicle
      const { data: vehicle, error: vehicleError } = await supabase
        .from('vehicles')
        .select('gang_id, fighter_id')
        .eq('id', equipmentData.vehicle_id)
        .single();
        
      if (vehicleError || !vehicle) {
        throw new Error('Vehicle not found for this equipment');
      }
      gangId = vehicle.gang_id;
      vehicleAssigned = !!vehicle.fighter_id;
    } else {
      throw new Error('Equipment is not associated with a fighter or vehicle');
    }

    // If user is not an admin, check if they have permission for this gang
    if (!isAdmin) {
      const { data: gang, error: gangError } = await supabase
        .from('gangs')
        .select('user_id')
        .eq('id', gangId)
        .single();

      if (gangError || !gang) {
        throw new Error('Gang not found');
      }

      if (gang.user_id !== user.id) {
        throw new Error('User does not have permission to move this equipment');
      }
    }

    // Remove associated fighter effects first (since equipment is being moved to stash)
    if (associatedEffects && associatedEffects.length > 0) {
      const effectIds = associatedEffects.map(effect => effect.id);
      
      // Delete the effects (this will cascade delete the modifiers)
      const { error: deleteEffectsError } = await supabase
        .from('fighter_effects')
        .delete()
        .in('id', effectIds);

      if (deleteEffectsError) {
        throw new Error(`Failed to remove associated effects: ${deleteEffectsError.message}`);
      }
    }

    // Update the equipment to move it to stash
    const { data: stashData, error: updateError } = await supabase
      .from('fighter_equipment')
      .update({
        fighter_id: null,
        vehicle_id: null,
        gang_stash: true
      })
      .eq('id', params.fighter_equipment_id)
      .select('id')
      .single();

    if (updateError || !stashData) {
      throw new Error(`Failed to move equipment to stash: ${updateError?.message || 'No data returned'}`);
    }

    // Rating delta: subtract equipment purchase_cost and removed effects if from fighter or assigned vehicle
    let ratingDelta = 0;
    if (equipmentData.fighter_id || (equipmentData.vehicle_id && vehicleAssigned)) {
      ratingDelta -= (equipmentData.purchase_cost || 0);
      const effectsCredits = (associatedEffects || []).reduce((s, eff: any) => s + (eff.type_specific_data?.credits_increase || 0), 0);
      ratingDelta -= effectsCredits;
    }

    if (ratingDelta !== 0) {
      try {
        const { data: ratingRow } = await supabase
          .from('gangs')
          .select('rating')
          .eq('id', gangId)
          .single();
        const currentRating = (ratingRow?.rating ?? 0) as number;
        await supabase
          .from('gangs')
          .update({ rating: Math.max(0, currentRating + ratingDelta) })
          .eq('id', gangId);
        // Cache invalidation now handled by TanStack Query client-side
        // invalidateGangRating(gangId);
      } catch (e) {
        console.error('Failed to update gang rating after moving equipment to stash:', e);
      }
    }

    // Cache invalidation now handled by TanStack Query client-side
    // if (equipmentData.fighter_id) {
    //   invalidateFighterEquipment(equipmentData.fighter_id, gangId);
    //   // If there were associated effects removed, also invalidate fighter effects
    //   if ((associatedEffects?.length || 0) > 0) {
    //     invalidateFighterAdvancement({
    //       fighterId: equipmentData.fighter_id,
    //       gangId,
    //       advancementType: 'effect'
    //     });
    //   }
    // } else if (equipmentData.vehicle_id) {
    //   // For vehicle equipment, we need to get the fighter_id from the vehicle
    //   const { data: vehicleData, error: vehicleError } = await supabase
    //     .from('vehicles')
    //     .select('fighter_id')
    //     .eq('id', equipmentData.vehicle_id)
    //     .single();
    //   
    //   if (!vehicleError && vehicleData?.fighter_id) {
    //     invalidateFighterEquipment(vehicleData.fighter_id, gangId);
    //     invalidateFighterVehicleData(vehicleData.fighter_id, gangId);
    //     // If there were associated effects removed, also invalidate fighter effects
    //     if ((associatedEffects?.length || 0) > 0) {
    //       invalidateFighterAdvancement({
    //         fighterId: vehicleData.fighter_id,
    //         gangId,
    //         advancementType: 'effect'
    //       });
    //     }
    //   }
    //   
    //   // Also invalidate vehicle-specific cache tags
    //   invalidateVehicleData(equipmentData.vehicle_id);
    // }
    
    // Log equipment moved to stash
    try {
      // Get equipment name for logging
      let equipmentName = 'Unknown Equipment';
      if (equipmentData.equipment_id) {
        const { data: equipment } = await supabase
          .from('equipment')
          .select('equipment_name')
          .eq('id', equipmentData.equipment_id)
          .single();
        if (equipment) equipmentName = equipment.equipment_name;
      } else if (equipmentData.custom_equipment_id) {
        const { data: customEquipment } = await supabase
          .from('custom_equipment')
          .select('equipment_name')
          .eq('id', equipmentData.custom_equipment_id)
          .single();
        if (customEquipment) equipmentName = customEquipment.equipment_name;
      }

      await logEquipmentAction({
        gang_id: gangId,
        fighter_id: equipmentData.fighter_id || undefined,
        vehicle_id: equipmentData.vehicle_id || undefined,
        equipment_name: equipmentName,
        purchase_cost: equipmentData.purchase_cost || 0,
        action_type: 'moved_to_stash',
        user_id: user.id
      });
    } catch (logError) {
      console.error('Failed to log equipment moved to stash:', logError);
    }

    // Cache invalidation now handled by TanStack Query client-side
    // invalidateGangFinancials(gangId);
    // 
    // // Also invalidate gang stash specifically
    // invalidateGangStash({
    //   gangId: gangId,
    //   userId: user.id
    // });

    return {
      success: true,
      data: {
        stash_id: stashData.id,
        equipment_moved: {
          id: equipmentData.id,
          fighter_id: equipmentData.fighter_id || undefined,
          vehicle_id: equipmentData.vehicle_id || undefined,
          equipment_id: equipmentData.equipment_id || undefined,
          custom_equipment_id: equipmentData.custom_equipment_id || undefined,
        },
        removed_effects: associatedEffects || []
      }
    };

  } catch (error) {
    console.error('Error in moveEquipmentToStash server action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}