'use server'

import { createClient } from "@/utils/supabase/server";
import { checkAdminOptimized, getAuthenticatedUser } from "@/utils/auth";
import { logEquipmentAction } from '@/app/actions/logs/equipment-logs';

interface SellEquipmentParams {
  fighter_equipment_id: string;
  manual_cost?: number;
}

interface SellEquipmentResult {
  success: boolean;
  data?: {
    gang: {
      id: string;
      credits: number;
    };
    equipment_sold: {
      id: string;
      fighter_id?: string;
      vehicle_id?: string;
      equipment_id?: string;
      custom_equipment_id?: string;
      sell_value: number;
    };
    deleted_effects?: Array<{
      id: string;
      type_specific_data?: any;
    }>;
    fighter_total_cost?: number;
  };
  error?: string;
}

// Stash-specific sell params/result
interface StashSellParams {
  stash_id: string;
  manual_cost: number; // server re-clamps to be safe
}

interface StashActionResult {
  success: boolean;
  data?: { gang: { id: string; credits: number } };
  error?: string;
}

export async function sellEquipmentFromFighter(params: SellEquipmentParams): Promise<SellEquipmentResult> {
  try {
    const supabase = await createClient();
    
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
        purchase_cost
      `)
      .eq('id', params.fighter_equipment_id)
      .single();

    if (equipmentError || !equipmentData) {
      throw new Error(`Fighter equipment with ID ${params.fighter_equipment_id} not found`);
    }

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
      // Get gang_id from vehicle and whether vehicle is assigned
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
        throw new Error('User does not have permission to sell this equipment');
      }
    }

    // Determine sell value (manual or default to purchase cost)
    const sellValue = params.manual_cost ?? equipmentData.purchase_cost ?? 0;

    // Get equipment name for logging before deletion
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

    // Find associated effects before deletion
    const { data: associatedEffects } = await supabase
      .from('fighter_effects')
      .select('id, type_specific_data')
      .eq('fighter_equipment_id', params.fighter_equipment_id);

    // Start transaction-like sequence: Delete equipment and update gang credits
    const { error: deleteError } = await supabase
      .from('fighter_equipment')
      .delete()
      .eq('id', params.fighter_equipment_id);

    if (deleteError) {
      throw new Error(`Failed to delete equipment: ${deleteError.message}`);
    }

    // Log equipment sale
    try {
      await logEquipmentAction({
        gang_id: gangId,
        fighter_id: equipmentData.fighter_id,
        vehicle_id: equipmentData.vehicle_id,
        equipment_name: equipmentName,
        purchase_cost: sellValue,
        action_type: 'sold',
        user_id: user.id
      });
    } catch (logError) {
      console.error('Failed to log equipment sale:', logError);
      // Don't fail the main operation for logging errors
    }

    // Update gang credits - get current credits and update manually
    const { data: currentGang, error: getCurrentError } = await supabase
      .from('gangs')
      .select('credits, rating')
      .eq('id', gangId)
      .single();
      
    if (getCurrentError || !currentGang) {
      throw new Error('Failed to get current gang credits');
    }
    
    const { data: updatedGang, error: updateError } = await supabase
      .from('gangs')
      .update({ credits: currentGang.credits + sellValue })
      .eq('id', gangId)
      .select('id, credits')
      .single();
      
    if (updateError || !updatedGang) {
      throw new Error(`Failed to update gang credits: ${updateError?.message}`);
    }

    // Compute rating delta: subtract purchase_cost and associated effects credits when applicable
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
      } catch (e) {
        console.error('Failed to update gang rating after selling equipment:', e);
      }
    }

    // Get updated fighter total cost if this was fighter equipment
    let fighterTotalCost: number | undefined;
    if (equipmentData.fighter_id) {
      try {
        const { data: fighterCost } = await supabase
          .from('fighters')
          .select('total_cost')
          .eq('id', equipmentData.fighter_id)
          .single();
        fighterTotalCost = fighterCost?.total_cost;
      } catch (e) {
        console.error('Failed to get updated fighter total cost:', e);
      }
    }

    return {
      success: true,
      data: {
        gang: {
          id: updatedGang.id,
          credits: updatedGang.credits
        },
        equipment_sold: {
          id: equipmentData.id,
          fighter_id: equipmentData.fighter_id || undefined,
          vehicle_id: equipmentData.vehicle_id || undefined,
          equipment_id: equipmentData.equipment_id || undefined,
          custom_equipment_id: equipmentData.custom_equipment_id || undefined,
          sell_value: sellValue
        },
        deleted_effects: associatedEffects || [],
        fighter_total_cost: fighterTotalCost
      }
    };

  } catch (error) {
    console.error('Error in sellEquipmentFromFighter server function:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
} 

// Sell an item directly from the gang stash
export async function sellEquipmentFromStash(params: StashSellParams): Promise<StashActionResult> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: row, error: fetchErr } = await supabase
      .from('fighter_equipment')
      .select('id, gang_id, gang_stash')
      .eq('id', params.stash_id)
      .single();
    if (fetchErr || !row) return { success: false, error: 'Stash item not found' };
    if (!row.gang_stash) return { success: false, error: 'Item is not in gang stash' };

    const sellValue = Math.max(5, Math.floor(params.manual_cost || 0));

    // Update gang credits
    const { data: currentGang, error: gangErr } = await supabase
      .from('gangs')
      .select('credits')
      .eq('id', row.gang_id)
      .single();
    if (gangErr || !currentGang) return { success: false, error: 'Gang not found' };

    const { data: updatedGang, error: updErr } = await supabase
      .from('gangs')
      .update({ credits: (currentGang.credits || 0) + sellValue })
      .eq('id', row.gang_id)
      .select('id, credits')
      .single();
    if (updErr || !updatedGang) return { success: false, error: 'Failed updating credits' };

    // Delete the stash item
    const { error: delErr } = await supabase
      .from('fighter_equipment')
      .delete()
      .eq('id', params.stash_id);
    if (delErr) return { success: false, error: delErr.message };

    return { success: true, data: { gang: { id: updatedGang.id, credits: updatedGang.credits } } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
