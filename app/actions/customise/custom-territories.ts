'use server';

import { createClient } from "@/utils/supabase/server";
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidatePath, revalidateTag } from "next/cache";

export async function updateCustomTerritory(
  territoryId: string,
  updates: {
    territory_name?: string;
  }
) {
  const supabase = await createClient();
  
  // Get the current user
  const user = await getAuthenticatedUser(supabase);
  

  // Prepare the update data
  const updateData: any = {
    ...updates,
    updated_at: new Date().toISOString()
  };
  
  // Trim territory name if it's being updated
  if (updates.territory_name !== undefined) {
    updateData.territory_name = updates.territory_name.trimEnd();
  }

  // Update the territory, but only if it belongs to the current user
  const { data, error } = await supabase
    .from('custom_territories')
    .update(updateData)
    .eq('id', territoryId)
    .eq('user_id', user.id) // Security: only update user's own territories
    .select()
    .single();

  if (error) {
    console.error('Error updating custom territory:', error);
    throw new Error(`Failed to update territory: ${error.message}`);
  }

  // Revalidate the home page (customise tab) and territory cache
  revalidatePath('/');
  revalidateTag(`custom-territories-${user.id}`);
  revalidateTag('territories-list');
  
  return data;
}

export async function deleteCustomTerritory(territoryId: string) {
  const supabase = await createClient();
  
  // Get the current user
  const user = await getAuthenticatedUser(supabase);
  

  // Delete the territory, but only if it belongs to the current user
  const { error } = await supabase
    .from('custom_territories')
    .delete()
    .eq('id', territoryId)
    .eq('user_id', user.id); // Security: only delete user's own territories

  if (error) {
    console.error('Error deleting custom territory:', error);
    throw new Error(`Failed to delete territory: ${error.message}`);
  }

  // Revalidate the home page (customise tab) and territory cache
  revalidatePath('/');
  revalidateTag(`custom-territories-${user.id}`);
  revalidateTag('territories-list');
  
  return { success: true };
}

export async function fetchUserCustomTerritories(campaignTypeId?: string) {
  const supabase = await createClient();
  
  // Get the current user
  const user = await getAuthenticatedUser(supabase);
  

  try {
    // Custom territories don't have campaign types, so ignore the campaignTypeId parameter
    const { data: customTerritories, error } = await supabase
      .from('custom_territories')
      .select('*')
      .eq('user_id', user.id)
      .order('territory_name', { ascending: true });

    if (error) {
      console.error('Error fetching custom territories:', error);
      throw new Error(`Failed to fetch custom territories: ${error.message}`);
    }

    return { success: true, data: customTerritories || [] };
  } catch (error) {
    console.error('Error in fetchUserCustomTerritories:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to fetch custom territories' 
    };
  }
}

export async function createCustomTerritory(data: {
  territory_name: string;
}) {
  const supabase = await createClient();
  
  // Get the current user
  const user = await getAuthenticatedUser(supabase);
  

  // Create the custom territory
  const { data: newTerritory, error } = await supabase
    .from('custom_territories')
    .insert({
      user_id: user.id,
      territory_name: data.territory_name.trimEnd(),
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating custom territory:', error);
    throw new Error(`Failed to create territory: ${error.message}`);
  }

  // Revalidate the home page (customise tab) and territory cache
  revalidatePath('/');
  revalidateTag(`custom-territories-${user.id}`);
  revalidateTag('territories-list');
  
  return newTerritory;
}