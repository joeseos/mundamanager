'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export interface CustomWeaponProfileData {
  profile_name?: string;
  range_short: string;
  range_long: string;
  acc_short: string;
  acc_long: string;
  strength: string;
  ap: string;
  damage: string;
  ammo: string;
  traits?: string;
  sort_order?: number;
}

export async function saveCustomWeaponProfiles(
  equipmentId: string,
  profiles: CustomWeaponProfileData[]
) {
  const supabase = await createClient();
  
  // Get the current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    throw new Error('Unauthorized');
  }

  try {
    // First, delete existing profiles for this equipment
    const { error: deleteError } = await supabase
      .from('custom_weapon_profiles')
      .delete()
      .eq('weapon_group_id', equipmentId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting existing weapon profiles:', deleteError);
      throw new Error(`Failed to delete existing weapon profiles: ${deleteError.message}`);
    }

    // Then, insert new profiles if any
    if (profiles.length > 0) {
      const profilesWithMetadata = profiles.map((profile, index) => {
        // Remove any existing id to let the database generate a new one
        const { id, ...profileWithoutId } = profile as any;
        
        return {
          ...profileWithoutId,
          custom_equipment_id: equipmentId,
          weapon_group_id: equipmentId,
          user_id: user.id,
          sort_order: index,
          created_at: new Date().toISOString()
        };
      });

      console.log('Inserting weapon profiles with metadata:', profilesWithMetadata);
      const { error: insertError } = await supabase
        .from('custom_weapon_profiles')
        .insert(profilesWithMetadata);

      if (insertError) {
        console.error('Error inserting weapon profiles:', insertError);
        throw new Error(`Failed to save weapon profiles: ${insertError.message}`);
      }
    }

    // Revalidate the customize page
    revalidatePath('/customize');
    
    return { success: true };
  } catch (error) {
    console.error('Error saving weapon profiles:', error);
    throw error;
  }
}

export async function testDatabaseConnection() {
  const supabase = await createClient();
  
  try {
    console.log('Testing database connection to custom_weapon_profiles...');
    const { data, error, count } = await supabase
      .from('custom_weapon_profiles')
      .select('*', { count: 'exact' });
    
    console.log('Database test result:', { data, error, count });
    return { data, error, count };
  } catch (error) {
    console.error('Database test error:', error);
    return { error };
  }
}

export async function getCustomWeaponProfiles(equipmentId: string) {
  const supabase = await createClient();
  
  // Get the current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    throw new Error('Unauthorized');
  }

  try {
    // First try to find profiles by weapon_group_id
    let { data, error } = await supabase
      .from('custom_weapon_profiles')
      .select('*')
      .eq('weapon_group_id', equipmentId)
      .eq('user_id', user.id)
      .order('sort_order');

    // If no profiles found with weapon_group_id, try custom_equipment_id as fallback
    if (!error && (!data || data.length === 0)) {
      const fallbackResult = await supabase
        .from('custom_weapon_profiles')
        .select('*')
        .eq('custom_equipment_id', equipmentId)
        .eq('user_id', user.id)
        .order('sort_order');
      
      if (!fallbackResult.error && fallbackResult.data) {
        data = fallbackResult.data;
      }
    }

    if (error) {
      console.error('Error fetching weapon profiles:', error);
      throw new Error(`Failed to fetch weapon profiles: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching weapon profiles:', error);
    throw error;
  }
} 