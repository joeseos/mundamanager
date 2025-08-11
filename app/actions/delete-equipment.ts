'use server'

import { createClient } from "@/utils/supabase/server";
import { 
  invalidateGangRating,
  invalidateEquipmentDeletion,
  invalidateGangStash
} from '@/utils/cache-tags';
import { getFighterTotalCost } from '@/app/lib/shared/fighter-data';
import { getAuthenticatedUser } from '@/utils/auth';

interface DeleteEquipmentParams {
  fighter_equipment_id: string;
  gang_id: string;
  fighter_id: string;
  vehicle_id?: string;
}

interface EquipmentActionResult {
  success: boolean;
  data?: any;
  error?: string;
}

// Stash-specific delete params/result
interface StashDeleteParams {
  stash_id: string;
}

interface StashActionResult {
  success: boolean;
  data?: any;
  error?: string;
}

export async function deleteEquipmentFromFighter(params: DeleteEquipmentParams): Promise<EquipmentActionResult> {
  try {
    const supabase = await createClient();
    
    // Authenticate user (RLS handles permissions)
    await getAuthenticatedUser(supabase);
    

    // Get equipment details before deletion to return proper response data
    const { data: equipmentBefore, error: equipmentError } = await supabase
      .from('fighter_equipment')
      .select(`
        id,
        fighter_id,
        vehicle_id,
        equipment_id,
        custom_equipment_id,
        purchase_cost,
        equipment:equipment_id (
          equipment_name,
          cost
        ),
        custom_equipment:custom_equipment_id (
          equipment_name,
          cost
        )
      `)
      .eq('id', params.fighter_equipment_id)
      .single();

    if (equipmentError || !equipmentBefore) {
      throw new Error(`Equipment with ID ${params.fighter_equipment_id} not found`);
    }

    // Get associated fighter effects before deletion (they'll be cascade deleted)
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

    // Determine rating delta prior to deletion
    let ratingDelta = 0;
    if (equipmentBefore.fighter_id) {
      ratingDelta -= (equipmentBefore.purchase_cost || 0);
      // subtract associated effects credits if any
      const effectsCredits = (associatedEffects || []).reduce((s, eff: any) => s + (eff.type_specific_data?.credits_increase || 0), 0);
      ratingDelta -= effectsCredits;
    } else if (equipmentBefore.vehicle_id) {
      // Only count if vehicle assigned
      const { data: veh } = await supabase
        .from('vehicles')
        .select('fighter_id')
        .eq('id', equipmentBefore.vehicle_id)
        .single();
      if (veh?.fighter_id) {
        ratingDelta -= (equipmentBefore.purchase_cost || 0);
        const effectsCredits = (associatedEffects || []).reduce((s, eff: any) => s + (eff.type_specific_data?.credits_increase || 0), 0);
        ratingDelta -= effectsCredits;
      }
    }

    // Delete the equipment (cascade will handle fighter effects automatically)
    const { error: deleteError } = await supabase
      .from('fighter_equipment')
      .delete()
      .eq('id', params.fighter_equipment_id);

    if (deleteError) {
      throw new Error(`Failed to delete equipment: ${deleteError.message}`);
    }

    // Update rating if needed
    if (ratingDelta !== 0) {
      try {
        // Get current rating and update
        const { data: curr } = await supabase
          .from('gangs')
          .select('rating')
          .eq('id', params.gang_id)
          .single();
        const currentRating = (curr?.rating ?? 0) as number;
        await supabase
          .from('gangs')
          .update({ rating: Math.max(0, currentRating + ratingDelta) })
          .eq('id', params.gang_id);
        invalidateGangRating(params.gang_id);
      } catch (e) {
        console.error('Failed to update gang rating after equipment deletion:', e);
      }
    }

    // Get fresh fighter total cost after deletion for accurate response
    let freshFighterTotalCost = null;
    try {
      freshFighterTotalCost = await getFighterTotalCost(params.fighter_id, supabase);
    } catch (fighterRefreshError) {
      console.warn('Could not refresh fighter total cost:', fighterRefreshError);
    }

    // Calculate equipment details for response - fix TypeScript errors
    const equipmentData = equipmentBefore.equipment as any;
    const customEquipmentData = equipmentBefore.custom_equipment as any;
    
    const equipmentCost = equipmentData?.cost || 
                         customEquipmentData?.cost || 
                         equipmentBefore.purchase_cost || 0;

    const equipmentName = equipmentData?.equipment_name || 
                         customEquipmentData?.equipment_name || 
                         'Unknown Equipment';

    // Use optimized cache invalidation for equipment deletion
    // Note: We could detect deleted beast IDs here if needed for even more granular updates
    invalidateEquipmentDeletion({
      fighterId: params.fighter_id,
      gangId: params.gang_id
      // deletedBeastIds could be added here if we track which beasts were deleted
    });
    
    return { 
      success: true, 
      data: {
        deletedEquipment: {
          id: equipmentBefore.id,
          equipment_name: equipmentName,
          cost: equipmentCost,
          fighter_id: equipmentBefore.fighter_id,
          vehicle_id: equipmentBefore.vehicle_id
        },
        deletedEffects: associatedEffects || [],
        // Return fresh fighter total cost so frontend can update immediately without waiting for revalidation
        updatedFighterTotalCost: freshFighterTotalCost
      }
    };
  } catch (error) {
    console.error('Error in deleteEquipmentFromFighter server action:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

// Delete an item directly from the gang stash (no rating updates)
export async function deleteEquipmentFromStash(params: StashDeleteParams): Promise<StashActionResult> {
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

    // Permission implicitly enforced by RLS; we still fetch to invalidate correctly
    const { error: delErr } = await supabase
      .from('fighter_equipment')
      .delete()
      .eq('id', params.stash_id);
    if (delErr) return { success: false, error: delErr.message };

    invalidateGangStash({ gangId: row.gang_id, userId: user.id });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}


