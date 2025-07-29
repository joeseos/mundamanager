'use server'

import { createClient } from "@/utils/supabase/server";
import { 
  invalidateEquipmentPurchase,
  invalidateEquipmentDeletion,
  addBeastToGangCache,
  invalidateFighterOwnedBeasts
} from '@/utils/cache-tags';

export interface ExoticBeastCreationParams {
  equipmentId: string;
  ownerFighterId: string;
  gangId: string;
  userId: string;
  fighterEquipmentId: string; // The equipment that grants the beast
}

export interface CreatedBeast {
  id: string;
  fighter_name: string;
  fighter_type: string;
  fighter_class: string;
  credits: number;
  equipment_source: string;
  created_at: string;
}

export interface ExoticBeastCreationResult {
  success: boolean;
  createdBeasts: CreatedBeast[];
  error?: string;
}

/**
 * Creates exotic beasts for equipment that grants them
 * Used when equipment is purchased or moved from stash to a fighter
 */
export async function createExoticBeastsForEquipment(
  params: ExoticBeastCreationParams
): Promise<ExoticBeastCreationResult> {
  try {
    const supabase = await createClient();
    const createdBeasts: CreatedBeast[] = [];

    // Check if this equipment can grant exotic beasts
    const { data: beastConfigs } = await supabase
      .from('exotic_beasts')
      .select(`
        *,
        fighter_types (
          id,
          fighter_type,
          cost,
          movement,
          weapon_skill,
          ballistic_skill,
          strength,
          toughness,
          wounds,
          initiative,
          attacks,
          leadership,
          cool,
          willpower,
          intelligence
        )
      `)
      .eq('equipment_id', params.equipmentId);

    if (!beastConfigs || beastConfigs.length === 0) {
      return { success: true, createdBeasts: [] };
    }


    
    // Create beast fighters for each beast config
    for (const beastConfig of beastConfigs) {
      const fighterType = beastConfig.fighter_types;
      if (!fighterType) {
        console.warn('No fighter type found for beast config:', beastConfig.id);
        continue;
      }

      // Create the beast fighter
      const { data: newFighter, error: createError } = await supabase
        .from('fighters')
        .insert({
          fighter_name: fighterType.fighter_type,
          fighter_type: fighterType.fighter_type,
          fighter_type_id: beastConfig.fighter_type_id,
          fighter_class: 'exotic beast',
          gang_id: params.gangId,
          credits: 0,
          movement: fighterType.movement,
          weapon_skill: fighterType.weapon_skill,
          ballistic_skill: fighterType.ballistic_skill,
          strength: fighterType.strength,
          toughness: fighterType.toughness,
          wounds: fighterType.wounds,
          initiative: fighterType.initiative,
          attacks: fighterType.attacks,
          leadership: fighterType.leadership,
          cool: fighterType.cool,
          willpower: fighterType.willpower,
          intelligence: fighterType.intelligence,
          xp: 0
        })
        .select('id, fighter_name, fighter_type, fighter_class, credits, created_at')
        .single();

      if (createError || !newFighter) {
        console.error('Error creating beast fighter:', createError);
        continue;
      }

      // Add default equipment for the beast
      await addDefaultEquipmentToBeast(supabase, newFighter.id, beastConfig.fighter_type_id, params.userId, params.gangId);

      // Create ownership record
      const { data: ownershipRecord } = await supabase
        .from('fighter_exotic_beasts')
        .insert({
          fighter_owner_id: params.ownerFighterId,
          fighter_pet_id: newFighter.id,
          fighter_equipment_id: params.fighterEquipmentId
        })
        .select('id')
        .single();

      if (ownershipRecord) {
        // Link the beast to its ownership record for cascade deletion
        await supabase
          .from('fighters')
          .update({ fighter_pet_id: ownershipRecord.id })
          .eq('id', newFighter.id);

        createdBeasts.push({
          id: newFighter.id,
          fighter_name: newFighter.fighter_name,
          fighter_type: newFighter.fighter_type,
          fighter_class: newFighter.fighter_class,
          credits: newFighter.credits,
          equipment_source: 'Granted by equipment',
          created_at: newFighter.created_at
        });
        
  
      }
    }

    return { success: true, createdBeasts };
  } catch (error) {
    console.error('Error in exotic beast creation process:', error);
    return { 
      success: false, 
      createdBeasts: [],
      error: error instanceof Error ? error.message : 'Unknown error in beast creation'
    };
  }
}

/**
 * Adds default equipment to a newly created beast fighter
 */
async function addDefaultEquipmentToBeast(
  supabase: any,
  beastFighterId: string,
  fighterTypeId: string,
  userId: string,
  gangId: string
): Promise<void> {
  try {
    // Get default equipment for the beast type
    const { data: defaultEquipmentData } = await supabase
      .from('fighter_defaults')
      .select(`
        equipment_id,
        equipment:equipment_id (
          id,
          equipment_name,
          equipment_type,
          equipment_category,
          cost
        )
      `)
      .eq('fighter_type_id', fighterTypeId)
      .not('equipment_id', 'is', null);

    // Add each default equipment item
    if (defaultEquipmentData && defaultEquipmentData.length > 0) {
      for (const defaultItem of defaultEquipmentData) {
        await supabase
          .from('fighter_equipment')
          .insert({
            gang_id: gangId,
            fighter_id: beastFighterId,
            equipment_id: defaultItem.equipment_id,
            purchase_cost: 0,
            original_cost: (defaultItem.equipment as any)?.cost || 0,
            user_id: userId
          });
      }
    }
  } catch (error) {
    console.error('Error adding default equipment to beast:', error);
    // Don't throw - this is not critical enough to fail the entire beast creation
  }
}

/**
 * Handles cache invalidation when beasts are created during equipment purchase
 */
export async function invalidateCacheForBeastCreation(params: {
  ownerFighterId: string;
  gangId: string;
  createdBeasts: CreatedBeast[];
}): Promise<void> {
  if (params.createdBeasts.length === 0) {
    return;
  }

  // Update the owner's beast list
  invalidateFighterOwnedBeasts(params.ownerFighterId, params.gangId);
  
  // Add each beast to gang cache individually for optimal performance
  params.createdBeasts.forEach(beast => {
    addBeastToGangCache(beast.id, params.gangId);
  });
}

/**
 * Handles cache invalidation when beasts are deleted during equipment deletion
 */
export async function invalidateCacheForBeastDeletion(params: {
  ownerFighterId: string;
  gangId: string;
  deletedBeastIds: string[];
}): Promise<void> {
  if (params.deletedBeastIds.length === 0) {
    return;
  }

  // Use the optimized cache invalidation for equipment deletion
  invalidateEquipmentDeletion({
    fighterId: params.ownerFighterId,
    gangId: params.gangId,
    deletedBeastIds: params.deletedBeastIds
  });
}

/**
 * Gets beast IDs that would be deleted when equipment is removed
 * This is useful for cache invalidation when equipment is deleted
 */
export async function getBeastIdsForEquipment(
  fighterEquipmentId: string
): Promise<string[]> {
  try {
    const supabase = await createClient();
    
    const { data: beastOwnership } = await supabase
      .from('fighter_exotic_beasts')
      .select('fighter_pet_id')
      .eq('fighter_equipment_id', fighterEquipmentId);

    return beastOwnership?.map(ownership => ownership.fighter_pet_id) || [];
  } catch (error) {
    console.error('Error getting beast IDs for equipment:', error);
    return [];
  }
}

/**
 * Checks if equipment can create exotic beasts
 */
export async function canEquipmentCreateBeasts(equipmentId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    
    const { data: beastConfigs } = await supabase
      .from('exotic_beasts')
      .select('id')
      .eq('equipment_id', equipmentId)
      .limit(1);

    return !!(beastConfigs && beastConfigs.length > 0);
  } catch (error) {
    console.error('Error checking if equipment can create beasts:', error);
    return false;
  }
} 