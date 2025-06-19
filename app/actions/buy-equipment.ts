'use server'

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

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

export async function buyEquipmentForFighter(params: BuyEquipmentParams) {
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
      manual_cost: params.manual_cost || null,
      master_crafted: params.master_crafted || false,
      use_base_cost_for_rating: params.use_base_cost_for_rating ?? true,
      buy_for_gang_stash: params.buy_for_gang_stash || false
    });

    if (error) {
      console.error('Error buying equipment:', error);
      throw error;
    }

    // Revalidate relevant paths
    revalidatePath(`/gang/${params.gang_id}`);
    if (params.fighter_id) {
      revalidatePath(`/fighter/${params.fighter_id}`);
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