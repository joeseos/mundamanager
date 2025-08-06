'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { getAuthenticatedUser } from '@/utils/auth';

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
  const user = await getAuthenticatedUser(supabase);
  

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
        // Validate that all required fields are present
        if (!profile.range_short || !profile.range_long || !profile.acc_short || 
            !profile.acc_long || !profile.strength || !profile.ap || 
            !profile.damage || !profile.ammo) {
          throw new Error('Missing required weapon profile fields');
        }

        // Remove any existing id to let the database generate a new one
        // but preserve all other fields including profile_name
        const { id, ...profileWithoutId } = profile as any;
        
        return {
          profile_name: profile.profile_name ? profile.profile_name.trimEnd() : null, // Trim profile_name if present
          range_short: profile.range_short,
          range_long: profile.range_long,
          acc_short: profile.acc_short,
          acc_long: profile.acc_long,
          strength: profile.strength,
          ap: profile.ap,
          damage: profile.damage,
          ammo: profile.ammo,
          traits: profile.traits || null, // Explicitly preserve traits
          sort_order: profile.sort_order !== undefined ? profile.sort_order : index,
          custom_equipment_id: equipmentId,
          weapon_group_id: equipmentId,
          user_id: user.id,
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
    revalidatePath('/customise');
    
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
  const user = await getAuthenticatedUser(supabase);
  

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