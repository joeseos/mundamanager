'use server'

import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";
import { 
  invalidateFighterData, 
  invalidateFighterVehicleData,
  invalidateFighterEquipment,
  addBeastToGangCache,
  invalidateFighterOwnedBeasts
} from '@/utils/cache-tags';
import { revalidatePath } from "next/cache";
import { 
  createExoticBeastsForEquipment, 
  invalidateCacheForBeastCreation,
  type CreatedBeast 
} from '@/app/lib/exotic-beasts';

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
    created_beasts?: CreatedBeast[];
  };
  error?: string;
}

export async function moveEquipmentFromStash(params: MoveFromStashParams): Promise<MoveFromStashResult> {
  const supabase = await createClient();
  
  try {
    // Validate input parameters
    if (!params.fighter_id && !params.vehicle_id) {
      throw new Error('Either fighter_id or vehicle_id must be provided');
    }
    
    if (params.fighter_id && params.vehicle_id) {
      throw new Error('Cannot provide both fighter_id and vehicle_id');
    }

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

    // Validate that stash item has either equipment_id or custom_equipment_id
    const isCustomEquipment = !!stashData.custom_equipment_id;
    if (!stashData.equipment_id && !stashData.custom_equipment_id) {
      throw new Error('Stash item has neither equipment_id nor custom_equipment_id');
    }

    // Verify fighter/vehicle belongs to same gang as stash item
    if (params.fighter_id) {
      const { data: fighter, error: fighterError } = await supabase
        .from('fighters')
        .select('gang_id')
        .eq('id', params.fighter_id)
        .single();

      if (fighterError || !fighter) {
        throw new Error('Fighter not found');
      }

      if (fighter.gang_id !== stashData.gang_id) {
        throw new Error('Fighter does not belong to the same gang');
      }
    } else if (params.vehicle_id) {
      const { data: vehicle, error: vehicleError } = await supabase
        .from('vehicles')
        .select('gang_id')
        .eq('id', params.vehicle_id)
        .single();

      if (vehicleError || !vehicle) {
        throw new Error('Vehicle not found');
      }

      if (vehicle.gang_id !== stashData.gang_id) {
        throw new Error('Vehicle does not belong to the same gang');
      }
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

    // Insert into fighter_equipment
    const { data: equipmentData, error: insertError } = await supabase
      .from('fighter_equipment')
      .insert({
        fighter_id: params.fighter_id || null,
        vehicle_id: params.vehicle_id || null,
        equipment_id: stashData.equipment_id,
        custom_equipment_id: stashData.custom_equipment_id,
        purchase_cost: stashData.cost,
        is_master_crafted: stashData.is_master_crafted || false
      })
      .select('id')
      .single();

    if (insertError || !equipmentData) {
      throw new Error(`Failed to insert equipment into fighter_equipment: ${insertError?.message || 'No data returned'}`);
    }

    // Delete from gang_stash (this completes the move operation)
    const { error: deleteError } = await supabase
      .from('gang_stash')
      .delete()
      .eq('id', params.stash_id);

    if (deleteError) {
      // If delete fails, we should try to rollback the equipment insert
      // Note: Supabase doesn't support transactions in the JS client, so we manually clean up
      await supabase
        .from('fighter_equipment')
        .delete()
        .eq('id', equipmentData.id);
        
      throw new Error(`Failed to delete from gang_stash: ${deleteError.message}`);
    }

    // Fetch weapon profiles for regular equipment (not custom equipment)
    let weaponProfiles: any[] = [];
    if (!isCustomEquipment && stashData.equipment_id) {
      const { data: profiles, error: profilesError } = await supabase
        .from('weapon_profiles')
        .select(`
          id,
          profile_name,
          range_short,
          range_long,
          acc_short,
          acc_long,
          strength,
          damage,
          ap,
          ammo,
          traits,
          weapon_id,
          created_at,
          weapon_group_id
        `)
        .eq('weapon_id', stashData.equipment_id);

      if (!profilesError && profiles) {
        // Add is_master_crafted flag to each profile
        weaponProfiles = profiles.map(profile => ({
          ...profile,
          is_master_crafted: stashData.is_master_crafted || false
        }));
      }
    }

    // Handle beast creation for fighter equipment moves (not custom equipment)
    let createdBeasts: CreatedBeast[] = [];
    if (params.fighter_id && !isCustomEquipment && stashData.equipment_id) {
      const beastCreationResult = await createExoticBeastsForEquipment({
        equipmentId: stashData.equipment_id,
        ownerFighterId: params.fighter_id,
        gangId: stashData.gang_id,
        userId: user.id,
        fighterEquipmentId: equipmentData.id
      });

      if (beastCreationResult.success) {
        createdBeasts = beastCreationResult.createdBeasts;
      } else {
        console.error('Beast creation failed during move from stash:', beastCreationResult.error);
      }
    }

    // Invalidate appropriate caches
    if (params.fighter_id) {
      // Use the same comprehensive cache invalidation as equipment purchases
      // Note: We don't pass createdBeasts to invalidateEquipmentPurchase since it handles them differently
      invalidateFighterEquipment(params.fighter_id, stashData.gang_id);

      // Handle beast-specific cache invalidation
      if (createdBeasts.length > 0) {
        // Use addBeastToGangCache directly for each beast (same as invalidateEquipmentPurchase does)
        createdBeasts.forEach(beast => {
          addBeastToGangCache(beast.id, stashData.gang_id);
        });
        // Also invalidate the owner's beast list
        invalidateFighterOwnedBeasts(params.fighter_id, stashData.gang_id);
      }
    } else if (params.vehicle_id) {
      // For vehicle equipment, get the fighter who owns the vehicle and invalidate their cache
      const { data: vehicle, error: vehicleError } = await supabase
        .from('vehicles')
        .select('fighter_id')
        .eq('id', params.vehicle_id)
        .single();

      if (!vehicleError && vehicle?.fighter_id) {
        invalidateFighterData(vehicle.fighter_id, stashData.gang_id);
        invalidateFighterVehicleData(vehicle.fighter_id, stashData.gang_id);
      }
    }

    // Also invalidate gang page cache
    revalidatePath(`/gang/${stashData.gang_id}`);

    return {
      success: true,
      data: {
        equipment_id: equipmentData.id,
        weapon_profiles: weaponProfiles,
        ...(createdBeasts.length > 0 && { created_beasts: createdBeasts })
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