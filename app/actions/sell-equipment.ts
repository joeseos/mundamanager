'use server'

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { checkAdmin } from "@/utils/auth";

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

export async function sellEquipmentFromFighter(params: SellEquipmentParams): Promise<SellEquipmentResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Check if user is an admin
    const isAdmin = await checkAdmin(supabase);
    
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
        .select('gang_id')
        .eq('id', equipmentData.vehicle_id)
        .single();
        
      if (vehicleError || !vehicle) {
        throw new Error('Vehicle not found for this equipment');
      }
      gangId = vehicle.gang_id;
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

    // Start transaction: Delete equipment and update gang credits
    const { error: deleteError } = await supabase
      .from('fighter_equipment')
      .delete()
      .eq('id', params.fighter_equipment_id);

    if (deleteError) {
      throw new Error(`Failed to delete equipment: ${deleteError.message}`);
    }

    // Update gang credits - get current credits and update manually
    const { data: currentGang, error: getCurrentError } = await supabase
      .from('gangs')
      .select('credits')
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

    // Revalidate relevant paths
    revalidatePath(`/gang/${gangId}`);
    if (equipmentData.fighter_id) {
      revalidatePath(`/fighter/${equipmentData.fighter_id}`);
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