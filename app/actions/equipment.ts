'use server'

import { createClient } from "@/utils/supabase/server";
import { revalidateTag } from "next/cache";
import { invalidateFighterData } from '@/utils/cache-tags';
import { getCompleteFighterData } from '@/app/lib/fighter-details';

interface BuyEquipmentParams {
  equipment_id?: string;
  custom_equipment_id?: string;
  gang_id: string;
  fighter_id?: string;
  vehicle_id?: string;
  manual_cost?: number;
  master_crafted?: boolean;
  use_base_cost_for_rating?: boolean;
  buy_for_gang_stash?: boolean;
}

interface DeleteEquipmentParams {
  fighter_equipment_id: string;
  gang_id: string;
  fighter_id: string;
  vehicle_id?: string;
}

interface MoveToStashParams {
  fighter_equipment_id: string;
  gang_id: string;
  fighter_id: string;
}

interface EquipmentActionResult {
  success: boolean;
  data?: any;
  error?: string;
}

export async function buyEquipmentForFighter(params: BuyEquipmentParams): Promise<EquipmentActionResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Call the Supabase function
    const { data, error } = await supabase.rpc('buy_equipment_for_fighter', {
      equipment_id: params.equipment_id || null,
      custom_equipment_id: params.custom_equipment_id || null,
      gang_id: params.gang_id,
      fighter_id: params.fighter_id || null,
      vehicle_id: params.vehicle_id || null,
      manual_cost: params.manual_cost ?? null,
      master_crafted: params.master_crafted || false,
      use_base_cost_for_rating: params.use_base_cost_for_rating ?? true,
      buy_for_gang_stash: params.buy_for_gang_stash || false
    });

    if (error) {
      console.error('Error buying equipment:', error);
      throw new Error(error.message || 'Failed to buy equipment');
    }

    // Invalidate fighter cache
    if (params.fighter_id) {
      invalidateFighterData(params.fighter_id, params.gang_id);
    } else {
      // For gang stash purchases, just invalidate gang cache
      revalidateTag(`gang-${params.gang_id}-credits`);
      revalidateTag(`gang-${params.gang_id}-rating`);
    }
    
    return { 
      success: true, 
      data
    };
  } catch (error) {
    console.error('Error in buyEquipmentForFighter server action:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

export async function deleteEquipmentFromFighter(params: DeleteEquipmentParams): Promise<EquipmentActionResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

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
        fighter_effect_modifiers (
          stat_name,
          numeric_value
        )
      `)
      .eq('fighter_equipment_id', params.fighter_equipment_id);

    // Delete the equipment (cascade will handle fighter effects automatically)
    const { error: deleteError } = await supabase
      .from('fighter_equipment')
      .delete()
      .eq('id', params.fighter_equipment_id);

    if (deleteError) {
      throw new Error(`Failed to delete equipment: ${deleteError.message}`);
    }

    // Get fresh fighter data after deletion for accurate response
    let freshFighterData = null;
    try {
      const completeFighterData = await getCompleteFighterData(params.fighter_id);
      freshFighterData = completeFighterData;
    } catch (fighterRefreshError) {
      console.warn('Could not refresh fighter data:', fighterRefreshError);
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

    // Invalidate fighter cache
    invalidateFighterData(params.fighter_id, params.gang_id);
    
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
        // Return fresh fighter data so frontend can update immediately without waiting for revalidation
        updatedFighter: freshFighterData?.fighter || null,
        updatedGang: freshFighterData?.gang || null,
        // Include vehicle data if this was vehicle equipment
        updatedVehicle: freshFighterData?.fighter?.vehicles?.[0] || null
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

export async function moveEquipmentToStash(params: MoveToStashParams): Promise<EquipmentActionResult> {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Get equipment details before moving
    const { data: equipmentBefore } = await supabase
      .from('fighter_equipment')
      .select(`
        id,
        vehicle_id,
        equipment:equipment_id (equipment_name),
        custom_equipment:custom_equipment_id (equipment_name)
      `)
      .eq('id', params.fighter_equipment_id)
      .single();

    const { data, error } = await supabase.rpc('move_to_gang_stash', {
      in_fighter_equipment_id: params.fighter_equipment_id,
      in_user_id: user.id
    });

    if (error) {
      throw new Error(error.message || 'Failed to move equipment to stash');
    }

    // Invalidate fighter cache
    invalidateFighterData(params.fighter_id, params.gang_id);
    
    // If it was vehicle equipment, still need to revalidate vehicle tags
    if (equipmentBefore?.vehicle_id) {
      revalidateTag(`vehicle-${equipmentBefore.vehicle_id}-equipment`);
      revalidateTag(`vehicle-${equipmentBefore.vehicle_id}-stats`);
    }

    return { success: true, data };
  } catch (error) {
    console.error('Error in moveEquipmentToStash server action:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
} 