'use server'

import { createClient } from "@/utils/supabase/server";
import { checkAdminOptimized, getAuthenticatedUser } from "@/utils/auth";
import { invalidateVehicleData, invalidateFighterVehicleData, invalidateEquipmentDeletion, invalidateGangRating, invalidateGangStash, invalidateFighterAdvancement } from '@/utils/cache-tags';
import { logEquipmentAction } from './logs/equipment-logs';
import { countsTowardRating } from '@/utils/fighter-status';

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
  data?: { gang: { id: string; credits: number; wealth: number } };
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
    let fighterIsActive = true; // Default to true for non-fighter equipment
    
    if (equipmentData.fighter_id) {
      // Get gang_id and status from fighter
      const { data: fighter, error: fighterError } = await supabase
        .from('fighters')
        .select('gang_id, killed, retired, enslaved, captured')
        .eq('id', equipmentData.fighter_id)
        .single();

      if (fighterError || !fighter) {
        throw new Error('Fighter not found for this equipment');
      }
      gangId = fighter.gang_id;
      fighterIsActive = countsTowardRating(fighter);
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

      // If vehicle is assigned to a fighter, check if that fighter is active
      if (vehicleAssigned && vehicle.fighter_id) {
        const { data: vehicleFighter, error: vehicleFighterError } = await supabase
          .from('fighters')
          .select('killed, retired, enslaved, captured')
          .eq('id', vehicle.fighter_id)
          .single();

        if (!vehicleFighterError && vehicleFighter) {
          fighterIsActive = countsTowardRating(vehicleFighter);
        }
      }
    } else {
      throw new Error('Equipment is not associated with a fighter or vehicle');
    }

    // Note: Authorization is enforced by RLS policies on fighter_equipment and gangs tables

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
    // BUT only if the fighter is active (not killed, retired, enslaved, or captured)
    // Inactive fighters are already excluded from rating calculations
    let ratingDelta = 0;
    if ((equipmentData.fighter_id || (equipmentData.vehicle_id && vehicleAssigned)) && fighterIsActive) {
      ratingDelta -= (equipmentData.purchase_cost || 0);
      const effectsCredits = (associatedEffects || []).reduce((s, eff: any) => s + (eff.type_specific_data?.credits_increase || 0), 0);
      ratingDelta -= effectsCredits;
    }

    // Update rating and wealth
    // Note: Credits were already updated above, so wealth delta should account for:
    // - Rating decrease (equipment cost removed from gang)
    // - Credits increase (sell value already added to credits above)
    // Since credits were updated separately, wealthDelta = ratingDelta + sellValue
    try {
      const { data: gangRow } = await supabase
        .from('gangs')
        .select('rating, wealth')
        .eq('id', gangId)
        .single();
      const currentRating = (gangRow?.rating ?? 0) as number;
      const currentWealth = (gangRow?.wealth ?? 0) as number;

      // Wealth delta = rating change + credits change
      // Rating decreases by purchase_cost, credits increase by sellValue
      const wealthDelta = ratingDelta + sellValue;

      await supabase
        .from('gangs')
        .update({
          rating: Math.max(0, currentRating + ratingDelta),
          wealth: Math.max(0, currentWealth + wealthDelta)
        })
        .eq('id', gangId);
      invalidateGangRating(gangId);
    } catch (e) {
      console.error('Failed to update gang rating/wealth after selling equipment:', e);
    }

    // Invalidate caches - selling equipment affects gang credits/rating and possibly effects
    if (equipmentData.fighter_id) {
      // Use equipment deletion invalidation since selling is essentially deletion with credit refund
      // This ensures both fighter equipment list AND gang credits are properly invalidated
      invalidateEquipmentDeletion({
        fighterId: equipmentData.fighter_id,
        gangId: gangId
      });
      // If the equipment had effects, also invalidate fighter effects + derived data
      if ((associatedEffects?.length || 0) > 0) {
        invalidateFighterAdvancement({
          fighterId: equipmentData.fighter_id,
          gangId,
          advancementType: 'effect'
        });
      }
    } else if (equipmentData.vehicle_id) {
      // For vehicle equipment, we need to get the fighter_id from the vehicle
      const { data: vehicleData, error: vehicleError } = await supabase
        .from('vehicles')
        .select('fighter_id')
        .eq('id', equipmentData.vehicle_id)
        .single();
      
      if (!vehicleError && vehicleData?.fighter_id) {
        // Use equipment deletion invalidation for the fighter to ensure equipment list updates
        invalidateEquipmentDeletion({
          fighterId: vehicleData.fighter_id,
          gangId: gangId
        });
        invalidateFighterVehicleData(vehicleData.fighter_id, gangId);
        // Also invalidate fighter effects if the sold vehicle equipment had effects linked
        if ((associatedEffects?.length || 0) > 0) {
          invalidateFighterAdvancement({
            fighterId: vehicleData.fighter_id,
            gangId,
            advancementType: 'effect'
          });
        }
      }
      
      // Also invalidate vehicle-specific cache tags
      invalidateVehicleData(equipmentData.vehicle_id);
    } else {
      // For stash equipment, invalidate stash cache
      invalidateGangStash({ gangId, userId: user.id });
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
        }
      }
    };

  } catch (error) {
    console.error('Error in sellEquipmentFromFighter server action:', error);
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
      .select('id, gang_id, gang_stash, purchase_cost')
      .eq('id', params.stash_id)
      .single();
    if (fetchErr || !row) return { success: false, error: 'Stash item not found' };
    if (!row.gang_stash) return { success: false, error: 'Item is not in gang stash' };

    const sellValue = Math.floor(params.manual_cost || 0);
    const purchaseCost = row.purchase_cost || 0;

    // Update gang credits and wealth
    const { data: currentGang, error: gangErr } = await supabase
      .from('gangs')
      .select('credits, wealth')
      .eq('id', row.gang_id)
      .single();
    if (gangErr || !currentGang) return { success: false, error: 'Gang not found' };

    // When selling from stash:
    // - Credits increase by sellValue
    // - Stash value decreases by purchaseCost (what was originally paid)
    // - Wealth delta = creditsDelta - purchaseCost = sellValue - purchaseCost
    const creditsDelta = sellValue;
    const stashValueDelta = -purchaseCost;
    const wealthDelta = creditsDelta + stashValueDelta;

    const { data: updatedGang, error: updErr } = await supabase
      .from('gangs')
      .update({
        credits: (currentGang.credits || 0) + sellValue,
        wealth: Math.max(0, (currentGang.wealth || 0) + wealthDelta)
      })
      .eq('id', row.gang_id)
      .select('id, credits, wealth')
      .single();
    if (updErr || !updatedGang) return { success: false, error: 'Failed updating credits' };

    // Delete the stash item
    const { error: delErr } = await supabase
      .from('fighter_equipment')
      .delete()
      .eq('id', params.stash_id);
    if (delErr) return { success: false, error: delErr.message };

    // Invalidate stash cache so UI refreshes
    invalidateGangStash({ gangId: row.gang_id, userId: user.id });

    return { success: true, data: { gang: { id: updatedGang.id, credits: updatedGang.credits, wealth: updatedGang.wealth } } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}