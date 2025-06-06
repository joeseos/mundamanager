'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateCustomEquipment(
  equipmentId: string,
  updates: {
    equipment_name?: string;
    cost?: number;
  }
) {
  const supabase = await createClient();
  
  // Get the current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    throw new Error('Unauthorized');
  }

  // Update the equipment, but only if it belongs to the current user
  const { data, error } = await supabase
    .from('custom_equipment')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', equipmentId)
    .eq('user_id', user.id) // Security: only update user's own equipment
    .select()
    .single();

  if (error) {
    console.error('Error updating custom equipment:', error);
    throw new Error(`Failed to update equipment: ${error.message}`);
  }

  // Revalidate the customize page to show updated data
  revalidatePath('/customize');
  
  return data;
}

export async function deleteCustomEquipment(equipmentId: string) {
  const supabase = await createClient();
  
  // Get the current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    throw new Error('Unauthorized');
  }

  // Delete the equipment, but only if it belongs to the current user
  const { error } = await supabase
    .from('custom_equipment')
    .delete()
    .eq('id', equipmentId)
    .eq('user_id', user.id); // Security: only delete user's own equipment

  if (error) {
    console.error('Error deleting custom equipment:', error);
    throw new Error(`Failed to delete equipment: ${error.message}`);
  }

  // Revalidate the customize page to show updated data
  revalidatePath('/customize');
  
  return { success: true };
} 