'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { getUserCustomEquipmentByCategory } from "@/app/lib/custom-equipment";

export async function updateCustomEquipment(
  equipmentId: string,
  updates: {
    equipment_name?: string;
    cost?: number;
    equipment_category?: string;
    equipment_type?: 'wargear' | 'weapon';
    availability?: string;
  }
) {
  const supabase = await createClient();
  
  // Get the current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    throw new Error('Unauthorized');
  }

  // Prepare the update data
  const updateData: any = {
    ...updates,
    updated_at: new Date().toISOString()
  };
  
  // Trim equipment name if it's being updated
  if (updates.equipment_name !== undefined) {
    updateData.equipment_name = updates.equipment_name.trimEnd();
  }
  
  // If equipment_category is being updated, we need to get the category_id
  if (updates.equipment_category) {
    const { data: categoryData, error: categoryError } = await supabase
      .from('equipment_categories')
      .select('id, category_name')
      .eq('category_name', updates.equipment_category)
      .single();

    if (categoryError) {
      console.error('Error fetching equipment category:', categoryError);
      throw new Error(`Failed to find equipment category: ${categoryError.message}`);
    }

    updateData.equipment_category_id = categoryData.id;
  }

  // Update the equipment, but only if it belongs to the current user
  const { data, error } = await supabase
    .from('custom_equipment')
    .update(updateData)
    .eq('id', equipmentId)
    .eq('user_id', user.id) // Security: only update user's own equipment
    .select()
    .single();

  if (error) {
    console.error('Error updating custom equipment:', error);
    throw new Error(`Failed to update equipment: ${error.message}`);
  }

  // Revalidate the customize page to show updated data
  revalidatePath('/customise');
  
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
  revalidatePath('/customise');
  
  return { success: true };
}

export async function fetchUserCustomEquipment(category?: string) {
  try {
    const equipment = await getUserCustomEquipmentByCategory(category);
    return { success: true, data: equipment };
  } catch (error) {
    console.error('Error in fetchUserCustomEquipment:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch custom equipment' 
    };
  }
}

export async function createCustomEquipment(data: {
  equipment_name: string;
  availability: string;
  cost: number;
  equipment_category: string;
  equipment_type: 'wargear' | 'weapon';
}) {
  const supabase = await createClient();
  
  // Get the current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    throw new Error('Unauthorized');
  }

  // First, get the equipment category details
  const { data: categoryData, error: categoryError } = await supabase
    .from('equipment_categories')
    .select('id, category_name')
    .eq('category_name', data.equipment_category)
    .single();

  if (categoryError) {
    console.error('Error fetching equipment category:', categoryError);
    throw new Error(`Failed to find equipment category: ${categoryError.message}`);
  }

  // Create the custom equipment
  const { data: newEquipment, error } = await supabase
    .from('custom_equipment')
    .insert({
      user_id: user.id,
      equipment_name: data.equipment_name.trimEnd(),
      trading_post_category: 'Custom',
      availability: data.availability,
      cost: data.cost,
      equipment_category: categoryData.category_name,
      equipment_category_id: categoryData.id,
      equipment_type: data.equipment_type,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating custom equipment:', error);
    throw new Error(`Failed to create equipment: ${error.message}`);
  }

  // Revalidate the customize page to show new data
  revalidatePath('/customise');
  
  return newEquipment;
} 