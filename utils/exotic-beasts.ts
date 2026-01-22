'use server'

import { createClient } from "@/utils/supabase/server";
import { 
  invalidateEquipmentDeletion,
  addBeastToGangCache,
  invalidateFighterOwnedBeasts
} from '@/utils/cache-tags';

export interface ExoticBeastCreationParams {
  equipmentId: string;
  ownerFighterId?: string | null;  // Optional for stash purchases
  ownerFighterName?: string | null;
  gangId: string;
  userId: string;
  fighterEquipmentId: string; // The equipment that grants the beast
}

export interface CreatedBeast {
  id: string;
  fighter_name: string;
  fighter_type: string;
  fighter_class: string;
  fighter_type_id: string;
  credits: number;
  equipment_source: string;
  created_at: string;
  // Owner information
  owner: {
    id: string;
    fighter_name: string;
  };
  // Complete fighter stats
  movement: number;
  weapon_skill: number;
  ballistic_skill: number;
  strength: number;
  toughness: number;
  wounds: number;
  initiative: number;
  attacks: number;
  leadership: number;
  cool: number;
  willpower: number;
  intelligence: number;
  xp: number;
  kills: number;
  special_rules: string[];
  // Equipment and skills
  equipment: Array<{
    fighter_equipment_id: string;
    equipment_id: string;
    equipment_name: string;
    equipment_type: string;
    cost: number;
    weapon_profiles?: any[];
  }>;
  skills: Array<{
    skill_id: string;
    skill_name: string;
  }>;
}

export interface ExoticBeastCreationResult {
  success: boolean;
  createdBeasts: CreatedBeast[];
  error?: string;
}

/**
 * Creates exotic beasts for equipment that grants them
 * Used when equipment is purchased, moved from stash, or added as default equipment to a fighter
 * 
 * @param params - The parameters needed to create the exotic beast
 * @returns Promise containing success status and array of created beasts with complete data
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
          fighter_class_id,
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
          intelligence,
          special_rules
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
          fighter_class: 'Exotic Beast',
          fighter_class_id: fighterType.fighter_class_id,
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
          special_rules: fighterType.special_rules || [],
          xp: 0
        })
        .select('id, fighter_name, fighter_type, fighter_class, credits, created_at')
        .single();

      if (createError || !newFighter) {
        console.error('Error creating beast fighter:', createError);
        continue;
      }

      // Add default equipment for the beast
      const equipment = await addDefaultEquipmentToBeast(supabase, newFighter.id, beastConfig.fighter_type_id, params.userId, params.gangId);

      // Get default skills for the beast
      const skills = await addDefaultSkillsToBeast(supabase, newFighter.id, beastConfig.fighter_type_id, params.userId);

      // Create ownership record
      const { data: ownershipRecord } = await supabase
        .from('fighter_exotic_beasts')
        .insert({
          fighter_owner_id: params.ownerFighterId || null,  // null for stash
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

        // Use the equipment and skills data we just created (no need to fetch again)
        const beastData = {
          id: newFighter.id,
          fighter_name: newFighter.fighter_name,
          fighter_type: newFighter.fighter_type,
          fighter_class: newFighter.fighter_class,
          fighter_type_id: beastConfig.fighter_type_id,
          credits: fighterType.cost || 0,
          equipment_source: 'Granted by equipment',
          created_at: newFighter.created_at,
          // Owner information (may be null for stash purchases)
          owner: {
            id: params.ownerFighterId || '',
            fighter_name: params.ownerFighterName || ''
          },
          // Complete stats from the fighter type
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
          xp: 0,
          kills: 0,
          special_rules: fighterType.special_rules || [],
          equipment: equipment,
          skills: skills
        };
        
        createdBeasts.push(beastData);
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
 * 
 * @param supabase - Supabase client instance
 * @param beastFighterId - ID of the beast fighter to add equipment to
 * @param fighterTypeId - Fighter type ID to get default equipment for
 * @param userId - User ID for the equipment records
 * @param gangId - Gang ID for the equipment records
 * @returns Promise containing array of created equipment data
 */
async function addDefaultEquipmentToBeast(
  supabase: any,
  beastFighterId: string,
  fighterTypeId: string,
  userId: string,
  gangId: string
): Promise<Array<{ 
  fighter_equipment_id: string; 
  equipment_id: string; 
  equipment_name: string; 
  equipment_type: string; 
  cost: number; 
  weapon_profiles?: Array<{
    weapon_id: string;
    profile_name: string;
    range_short: string;
    range_long: string;
    acc_short: string;
    acc_long: string;
    strength: string;
    ap: string;
    damage: string;
    ammo: string;
    traits: string;
  }>;
}>> {
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
      const equipmentIds: string[] = [];
      
      for (const defaultItem of defaultEquipmentData) {
        const { data: insertedEquipment } = await supabase
          .from('fighter_equipment')
          .insert({
            gang_id: gangId,
            fighter_id: beastFighterId,
            equipment_id: defaultItem.equipment_id,
            purchase_cost: 0,
            original_cost: (defaultItem.equipment as any)?.cost || 0,
            user_id: userId
          })
          .select('id')
          .single();
          
        if (insertedEquipment) {
          equipmentIds.push(insertedEquipment.id);
        }
      }

      // Get weapon profiles for weapons
      const weaponIds = defaultEquipmentData
        .filter((item: any) => (item.equipment as any)?.equipment_type === 'weapon')
        .map((item: any) => item.equipment_id);

      let weaponProfiles: any[] = [];
      if (weaponIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('weapon_profiles')
          .select('*')
          .in('weapon_id', weaponIds);
        weaponProfiles = profilesData || [];
      }

      // Return the equipment data we just created
      return defaultEquipmentData.map((item: any, index: number) => ({
        fighter_equipment_id: equipmentIds[index] || '',
        equipment_id: item.equipment_id,
        equipment_name: (item.equipment as any)?.equipment_name || '',
        equipment_type: (item.equipment as any)?.equipment_type || '',
        cost: 0,
        weapon_profiles: weaponProfiles.filter((wp: any) => wp.weapon_id === item.equipment_id)
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Error adding default equipment to beast:', error);
    // Don't throw - this is not critical enough to fail the entire beast creation
    return [];
  }
}

/**
 * Adds default skills to a newly created beast fighter
 * 
 * @param supabase - Supabase client instance
 * @param beastFighterId - ID of the beast fighter to add skills to
 * @param fighterTypeId - Fighter type ID to get default skills for
 * @param userId - User ID for the skill records
 * @returns Promise containing array of created skill data
 */
async function addDefaultSkillsToBeast(
  supabase: any,
  beastFighterId: string,
  fighterTypeId: string,
  userId: string
): Promise<Array<{ skill_id: string; skill_name: string }>> {
  try {
    // Get default skills for the beast type
    const { data: defaultSkillsData } = await supabase
      .from('fighter_defaults')
      .select(`
        skill_id,
        skills!skill_id(
          id,
          name
        )
      `)
      .eq('fighter_type_id', fighterTypeId)
      .not('skill_id', 'is', null);

    // Add each default skill
    if (defaultSkillsData && defaultSkillsData.length > 0) {
      
      const skillInserts = defaultSkillsData.map((skill: { skill_id: string }) => ({
        fighter_id: beastFighterId,
        skill_id: skill.skill_id,
        user_id: userId
      }));

      await supabase
        .from('fighter_skills')
        .insert(skillInserts);

      // Return the skills data we just created
      const skillsToReturn = defaultSkillsData.map((skill: { skill_id: string; skills?: { name?: string }; name?: string }) => ({
        skill_id: skill.skill_id,
        skill_name: skill.skills?.name || skill.name || 'Unknown Skill'
      }));
      
      return skillsToReturn;
    }
    
    return [];
  } catch (error) {
    console.error('Error adding default skills to beast:', error);
    // Don't throw - this is not critical enough to fail the entire beast creation
    return [];
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