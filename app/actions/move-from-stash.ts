'use server'

import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";
import { invalidateFighterData } from '@/utils/cache-tags';
import { revalidatePath } from "next/cache";

interface MoveFromStashParams {
  stash_id: string;
  fighter_id?: string;
  vehicle_id?: string;
}

interface MoveFromStashResult {
  success: boolean;
  data?: {
    equipment_id: string;
    weapon_profiles?: any[];
  };
  error?: string;
}

export async function moveEquipmentFromStash(params: MoveFromStashParams): Promise<MoveFromStashResult> {
  try {
    const supabase = await createClient();
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Check if user is an admin
    const isAdmin = await checkAdmin(supabase);
    
    // Get the stash item data first to check permissions
    const { data: stashData, error: stashError } = await supabase
      .from('gang_stash')
      .select(`
        id,
        gang_id,
        equipment_id,
        custom_equipment_id,
        cost,
        is_master_crafted
      `)
      .eq('id', params.stash_id)
      .single();

    if (stashError || !stashData) {
      throw new Error(`Stash item with ID ${params.stash_id} not found`);
    }

    // If user is not an admin, check if they have permission for this gang
    if (!isAdmin) {
      const { data: gang, error: gangError } = await supabase
        .from('gangs')
        .select('user_id')
        .eq('id', stashData.gang_id)
        .single();

      if (gangError || !gang) {
        throw new Error('Gang not found');
      }

      if (gang.user_id !== user.id) {
        throw new Error('User does not have permission to move this equipment');
      }
    }

    // Use the RPC function to move equipment from stash
    const requestBody: any = {
      p_stash_id: params.stash_id
    };

    if (params.fighter_id) {
      requestBody.p_fighter_id = params.fighter_id;
    } else if (params.vehicle_id) {
      requestBody.p_vehicle_id = params.vehicle_id;
    } else {
      throw new Error('Either fighter_id or vehicle_id must be provided');
    }

    const { data: moveResult, error: moveError } = await supabase
      .rpc('move_from_stash', requestBody);

    if (moveError) {
      throw new Error(`Failed to move equipment from stash: ${moveError.message}`);
    }

    // Invalidate appropriate caches
    if (params.fighter_id) {
      // Invalidate fighter cache
      invalidateFighterData(params.fighter_id, stashData.gang_id);
    } else if (params.vehicle_id) {
      // For vehicle equipment, get the fighter who owns the vehicle and invalidate their cache
      const { data: vehicle, error: vehicleError } = await supabase
        .from('vehicles')
        .select('fighter_id')
        .eq('id', params.vehicle_id)
        .single();

      if (!vehicleError && vehicle?.fighter_id) {
        invalidateFighterData(vehicle.fighter_id, stashData.gang_id);
      }
    }

    // Also invalidate gang page cache
    revalidatePath(`/gang/${stashData.gang_id}`);

    return {
      success: true,
      data: {
        equipment_id: moveResult,
        weapon_profiles: moveResult?.weapon_profiles || []
      }
    };

  } catch (error) {
    console.error('Error in moveEquipmentFromStash server action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}