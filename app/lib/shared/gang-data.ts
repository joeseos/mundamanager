import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { getFighterBasic, getFighterEquipment, getFighterSkills, getFighterEffects, getFighterVehicles, getFighterTotalCost } from './fighter-data';

// =============================================================================
// TYPES - Shared interfaces for gang data
// =============================================================================

export interface GangBasic {
  id: string;
  name: string;
  gang_type: string;
  gang_type_id: string;
  gang_colour: string;
  reputation: number;
  meat: number;
  scavenging_rolls: number;
  exploration_points: number;
  alignment: string;
  note?: string;
  note_backstory?: string;
  created_at: string;
  last_updated: string;
  alliance_id?: string;
  gang_variants?: string[];
  user_id: string;
  gang_affiliation_id?: string | null;
  gang_affiliation?: {
    id: string;
    name: string;
  } | null;
  gang_types?: {
    affiliation: boolean;
  } | null;
  image_url?: string;
}

export interface GangType {
  id: string;
  gang_type: string;
  image_url: string;
}

export interface Alliance {
  id: string;
  alliance_name: string;
  alliance_type: string;
}

export interface GangStashItem {
  id: string;
  created_at: string;
  equipment_id?: string;
  custom_equipment_id?: string;
  equipment_name: string;
  equipment_type: string;
  equipment_category: string;
  cost: number;
  type: 'equipment';
}

export interface GangCampaign {
  campaign_id: string;
  campaign_name: string;
  role: string;
  status: string;
  invited_at?: string;
  joined_at?: string;
  invited_by?: string;
  has_meat: boolean;
  has_exploration_points: boolean;
  has_scavenging_rolls: boolean;
  territories: any[];
}

export interface GangVariant {
  id: string;
  variant: string;
}

export interface GangFighter {
  id: string;
  fighter_name: string;
  label?: string;
  fighter_type: string;
  fighter_class: string;
  fighter_sub_type?: {
    fighter_sub_type: string;
    fighter_sub_type_id: string;
  };
  alliance_crew_name?: string;
  position?: string;
  xp: number;
  kills: number;
  credits: number;
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
  equipment: any[];
  effects: Record<string, any[]>;
  skills: Record<string, any>;
  vehicles: any[];
  cost_adjustment?: number;
  special_rules?: string[];
  note?: string;
  killed: boolean;
  starved: boolean;
  retired: boolean;
  enslaved: boolean;
  recovery: boolean;
  captured: boolean;
  free_skill: boolean;
  image_url?: string;
  owner_name?: string;
  beast_equipment_stashed?: boolean;
}

// =============================================================================
// BASE DATA FUNCTIONS - Raw database queries with proper cache tags
// =============================================================================

/**
 * Get gang basic information (name, type, reputation, etc. - excludes credits)
 * Cache: BASE_GANG_BASIC
 */
export const getGangBasic = async (gangId: string, supabase: any): Promise<GangBasic> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('gangs')
        .select(`
          id,
          name,
          gang_type,
          gang_type_id,
          gang_colour,
          reputation,
          meat,
          scavenging_rolls,
          exploration_points,
          alignment,
          note,
          note_backstory,
          created_at,
          last_updated,
          alliance_id,
          gang_variants,
          user_id,
          gang_affiliation_id,
          gang_affiliation:gang_affiliation_id (
            id,
            name
          ),
          gang_types!gang_type_id(
            affiliation
          )
          image_url
        `)
        .eq('id', gangId)
        .single();

      if (error) throw error;
      return data;
    },
    [`gang-basic-${gangId}`],
    {
      tags: [CACHE_TAGS.BASE_GANG_BASIC(gangId)],
      revalidate: false
    }
  )();
};

/**
 * Get gang credits only
 * Cache: BASE_GANG_CREDITS
 */
export const getGangCredits = async (gangId: string, supabase: any): Promise<number> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('gangs')
        .select('credits')
        .eq('id', gangId)
        .single();

      if (error) throw error;
      return data.credits;
    },
    [`gang-credits-${gangId}`],
    {
      tags: [CACHE_TAGS.BASE_GANG_CREDITS(gangId)],
      revalidate: false
    }
  )();
};

/**
 * Get gang positioning data only
 * Cache: BASE_GANG_POSITIONING
 */
export const getGangPositioning = async (gangId: string, supabase: any): Promise<Record<string, any> | null> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('gangs')
        .select('positioning')
        .eq('id', gangId)
        .single();

      if (error) throw error;
      return data.positioning || null;
    },
    [`gang-positioning-${gangId}`],
    {
      tags: [CACHE_TAGS.BASE_GANG_POSITIONING(gangId)],
      revalidate: false
    }
  )();
};

/**
 * Get gang resources (meat, reputation, scavenging_rolls, exploration_points)
 * Cache: BASE_GANG_RESOURCES
 */
export const getGangResources = async (gangId: string, supabase: any): Promise<{
  meat: number;
  reputation: number;
  scavenging_rolls: number;
  exploration_points: number;
}> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('gangs')
        .select('meat, reputation, scavenging_rolls, exploration_points')
        .eq('id', gangId)
        .single();

      if (error) throw error;
      return data;
    },
    [`gang-resources-${gangId}`],
    {
      tags: [CACHE_TAGS.BASE_GANG_RESOURCES(gangId)],
      revalidate: false
    }
  )();
};

/**
 * Get gang stash equipment
 * Cache: BASE_GANG_STASH
 */
export const getGangStash = async (gangId: string, supabase: any): Promise<GangStashItem[]> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('fighter_equipment')
        .select(`
          id,
          created_at,
          equipment_id,
          custom_equipment_id,
          purchase_cost,
          equipment:equipment_id (
            equipment_name,
            equipment_type,
            equipment_category
          ),
          custom_equipment:custom_equipment_id (
            equipment_name,
            equipment_type,
            equipment_category
          )
        `)
        .eq('gang_id', gangId)
        .eq('gang_stash', true);

      if (error) throw error;

      return (data || []).map((item: any) => ({
        id: item.id,
        created_at: item.created_at,
        equipment_id: item.equipment_id,
        custom_equipment_id: item.custom_equipment_id,
        equipment_name: (item.equipment as any)?.equipment_name || (item.custom_equipment as any)?.equipment_name || 'Unknown',
        equipment_type: (item.equipment as any)?.equipment_type || (item.custom_equipment as any)?.equipment_type || 'unknown',
        equipment_category: (item.equipment as any)?.equipment_category || (item.custom_equipment as any)?.equipment_category || 'unknown',
        cost: item.purchase_cost,
        type: 'equipment' as const
      }));
    },
    [`gang-stash-${gangId}`],
    {
      tags: [CACHE_TAGS.BASE_GANG_STASH(gangId)],
      revalidate: false
    }
  )();
};

/**
 * Get gang type information
 * Cache: GLOBAL_GANG_TYPES (shared since gang types rarely change)
 */
export const getGangType = async (gangTypeId: string, supabase: any): Promise<GangType> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('gang_types')
        .select('gang_type_id, gang_type, image_url')
        .eq('gang_type_id', gangTypeId)
        .single();

      if (error) throw error;
      return {
        id: data.gang_type_id,
        gang_type: data.gang_type,
        image_url: data.image_url
      };
    },
    [`gang-type-${gangTypeId}`],
    {
      tags: [CACHE_TAGS.GLOBAL_GANG_TYPES()],
      revalidate: 3600 // 1 hour - gang types rarely change
    }
  )();
};

/**
 * Get alliance information
 * Cache: Shared alliance data
 */
export const getAlliance = async (allianceId: string | undefined, supabase: any): Promise<Alliance | null> => {
  if (!allianceId) return null;
  
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('alliances')
        .select('id, alliance_name, alliance_type')
        .eq('id', allianceId)
        .single();

      if (error) return null;
      return data;
    },
    [`alliance-${allianceId}`],
    {
      tags: [`alliance-${allianceId}`],
      revalidate: 3600 // 1 hour - alliances rarely change
    }
  )();
};

/**
 * Get gang variants
 * Cache: GLOBAL_GANG_TYPES (shared since variants rarely change)
 */
export const getGangVariants = async (gangVariantIds: string[], supabase: any): Promise<GangVariant[]> => {
  if (!gangVariantIds || gangVariantIds.length === 0) return [];
  
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('gang_variant_types')
        .select('id, variant')
        .in('id', gangVariantIds);

      if (error) return [];
      return data || [];
    },
    [`gang-variants-${gangVariantIds.join('-')}`],
    {
      tags: [CACHE_TAGS.GLOBAL_GANG_TYPES()],
      revalidate: 3600 // 1 hour - variants rarely change
    }
  )();
};

/**
 * Get gang campaigns
 * Cache: COMPOSITE_GANG_CAMPAIGNS
 */
export const getGangCampaigns = async (gangId: string, supabase: any): Promise<GangCampaign[]> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('campaign_gangs')
        .select(`
          role,
          status,
          invited_at,
          joined_at,
          invited_by,
          campaign:campaign_id (
            id,
            campaign_name,
            has_meat,
            has_exploration_points,
            has_scavenging_rolls
          )
        `)
        .eq('gang_id', gangId);

      if (error) return [];

      const campaigns: GangCampaign[] = [];
      
      for (const cg of data || []) {
        if (cg.campaign) {
          // Get territories for this campaign
          const { data: territories } = await supabase
            .from('campaign_territories')
            .select(`
              id,
              created_at,
              territory_id,
              territory_name,
              ruined
            `)
            .eq('campaign_id', (cg.campaign as any).id)
            .eq('gang_id', gangId);

          campaigns.push({
            campaign_id: (cg.campaign as any).id,
            campaign_name: (cg.campaign as any).campaign_name,
            role: cg.role,
            status: cg.status,
            invited_at: cg.invited_at,
            joined_at: cg.joined_at,
            invited_by: cg.invited_by,
            has_meat: (cg.campaign as any).has_meat,
            has_exploration_points: (cg.campaign as any).has_exploration_points,
            has_scavenging_rolls: (cg.campaign as any).has_scavenging_rolls,
            territories: territories || []
          });
        }
      }

      return campaigns;
    },
    [`gang-campaigns-${gangId}`],
    {
      tags: [CACHE_TAGS.COMPOSITE_GANG_CAMPAIGNS(gangId)],
      revalidate: false
    }
  )();
};

// =============================================================================
// COMPUTED DATA FUNCTIONS - Calculated values with proper cache tags
// =============================================================================

/**
 * Get stored gang rating from column (gangs.rating)
 * Cache: COMPUTED_GANG_RATING + SHARED_GANG_RATING
 */
export const getGangRating = async (gangId: string, supabase: any): Promise<number> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('gangs')
        .select('rating')
        .eq('id', gangId)
        .single();

      if (error) throw error;
      return (data?.rating ?? 0) as number;
    },
    [`gang-rating-${gangId}`],
    {
      tags: [
        CACHE_TAGS.COMPUTED_GANG_RATING(gangId),
        CACHE_TAGS.SHARED_GANG_RATING(gangId)
      ],
      revalidate: false
    }
  )();
};

/**
 * Get gang fighter count
 * Cache: COMPUTED_GANG_FIGHTER_COUNT
 */
export const getGangFighterCount = async (gangId: string, supabase: any): Promise<number> => {
  return unstable_cache(
    async () => {
      const { count, error } = await supabase
        .from('fighters')
        .select('*', { count: 'exact', head: true })
        .eq('gang_id', gangId)
        .eq('killed', false)
        .eq('retired', false)
        .eq('enslaved', false)
        .eq('captured', false);

      if (error) throw error;
      return count || 0;
    },
    [`gang-fighter-count-${gangId}`],
    {
      tags: [CACHE_TAGS.COMPUTED_GANG_FIGHTER_COUNT(gangId)],
      revalidate: false
    }
  )();
};

/**
 * Get gang beast count
 * Cache: COMPUTED_GANG_BEAST_COUNT
 */
export const getGangBeastCount = async (gangId: string, supabase: any): Promise<number> => {
  return unstable_cache(
    async () => {
      const { count, error } = await supabase
        .from('fighters')
        .select('*', { count: 'exact', head: true })
        .eq('gang_id', gangId)
        .eq('fighter_class', 'exotic beast')
        .eq('killed', false)
        .eq('retired', false)
        .eq('enslaved', false)
        .eq('captured', false);

      if (error) throw error;
      return count || 0;
    },
    [`gang-beast-count-${gangId}`],
    {
      tags: [CACHE_TAGS.COMPUTED_GANG_BEAST_COUNT(gangId)],
      revalidate: false
    }
  )();
};

// =============================================================================
// COMPOSITE DATA FUNCTIONS - Multi-entity aggregated data
// =============================================================================

/**
 * Get all fighters in a gang with complete data
 * Cache: COMPOSITE_GANG_FIGHTERS_LIST
 */
export const getGangFightersList = async (gangId: string, supabase: any): Promise<GangFighter[]> => {
  return unstable_cache(
    async () => {
      // Get all fighter IDs for this gang
      const { data: fighterIds, error: fighterIdsError } = await supabase
        .from('fighters')
        .select('id')
        .eq('gang_id', gangId);

      if (fighterIdsError || !fighterIds) return [];

      // Use the shared fighter data functions to get complete data for each fighter
      const fighters: GangFighter[] = [];
      
      for (const fighter of fighterIds) {
        try {
          // Get complete fighter data using shared functions
          const [
            fighterBasic,
            equipment,
            skills,
            effects,
            vehicles,
            totalCost
          ] = await Promise.all([
            getFighterBasic(fighter.id, supabase),
            getFighterEquipment(fighter.id, supabase),
            getFighterSkills(fighter.id, supabase),
            getFighterEffects(fighter.id, supabase),
            getFighterVehicles(fighter.id, supabase),
            getFighterTotalCost(fighter.id, supabase)
          ]);

          // Get fighter type and sub-type info
          const [fighterTypeData, fighterSubTypeData] = await Promise.all([
            supabase
              .from('fighter_types')
              .select('fighter_type, alliance_crew_name')
              .eq('id', fighterBasic.fighter_type_id)
              .single(),
            fighterBasic.fighter_sub_type_id ? 
              supabase
                .from('fighter_sub_types')
                .select('sub_type_name')
                .eq('id', fighterBasic.fighter_sub_type_id)
                .single() : 
              Promise.resolve({ data: null, error: null })
          ]);

          // Check if this fighter is owned by another fighter (i.e., is an exotic beast)
          let ownerName: string | undefined;
          let beastEquipmentStashed = false;
          if (fighterBasic.fighter_pet_id) {
            const { data: ownershipData } = await supabase
              .from('fighter_exotic_beasts')
              .select(`
                fighter_owner_id,
                fighter_equipment_id,
                fighters!fighter_owner_id (
                  fighter_name
                ),
                fighter_equipment!fighter_equipment_id (
                  gang_stash
                )
              `)
              .eq('id', fighterBasic.fighter_pet_id)
              .single();

            if (ownershipData) {
              ownerName = (ownershipData.fighters as any)?.fighter_name;
              beastEquipmentStashed = ownershipData.fighter_equipment?.gang_stash || false;
            }
          }

          fighters.push({
            id: fighterBasic.id,
            fighter_name: fighterBasic.fighter_name,
            label: fighterBasic.label,
            fighter_type: fighterBasic.fighter_type || fighterTypeData?.data?.fighter_type || 'Unknown',
            fighter_class: fighterBasic.fighter_class || 'Unknown',
            fighter_sub_type: fighterSubTypeData?.data ? {
              fighter_sub_type: fighterSubTypeData.data.sub_type_name,
              fighter_sub_type_id: fighterBasic.fighter_sub_type_id!
            } : undefined,
            alliance_crew_name: fighterTypeData?.data?.alliance_crew_name,
            position: fighterBasic.position,
            xp: fighterBasic.xp,
            kills: fighterBasic.kills || 0,
            credits: totalCost,
            movement: fighterBasic.movement,
            weapon_skill: fighterBasic.weapon_skill,
            ballistic_skill: fighterBasic.ballistic_skill,
            strength: fighterBasic.strength,
            toughness: fighterBasic.toughness,
            wounds: fighterBasic.wounds,
            initiative: fighterBasic.initiative,
            attacks: fighterBasic.attacks,
            leadership: fighterBasic.leadership,
            cool: fighterBasic.cool,
            willpower: fighterBasic.willpower,
            intelligence: fighterBasic.intelligence,
            equipment,
            effects,
            skills,
            vehicles,
            cost_adjustment: fighterBasic.cost_adjustment,
            special_rules: fighterBasic.special_rules || [],
            note: fighterBasic.note,
            killed: fighterBasic.killed || false,
            starved: fighterBasic.starved || false,
            retired: fighterBasic.retired || false,
            enslaved: fighterBasic.enslaved || false,
            recovery: fighterBasic.recovery || false,
            captured: fighterBasic.captured || false,
            free_skill: fighterBasic.free_skill || false,
            image_url: fighterBasic.image_url,
            owner_name: ownerName,
            beast_equipment_stashed: beastEquipmentStashed,
          });
        } catch (error) {
          console.error(`Error processing fighter ${fighter.id}:`, error);
          continue;
        }
      }

      return fighters;
    },
    [`gang-fighters-list-${gangId}`],
    {
      tags: [CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(gangId)],
      revalidate: false
    }
  )();
};

/**
 * Get gang vehicles (not assigned to specific fighters)
 * Cache: BASE_GANG_VEHICLES (these are gang-owned vehicles)
 */
export const getGangVehicles = async (gangId: string, supabase: any): Promise<any[]> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('vehicles')
        .select(`
          id,
          created_at,
          vehicle_type_id,
          vehicle_type,
          cost,
          vehicle_name,
          movement,
          front,
          side,
          rear,
          hull_points,
          handling,
          save,
          body_slots,
          drive_slots,
          engine_slots,
          body_slots_occupied,
          drive_slots_occupied,
          engine_slots_occupied,
          special_rules
        `)
        .eq('gang_id', gangId)
        .is('fighter_id', null);

      if (error) {
        console.error('🚗 Database error:', error);
        return [];
      }

      // Get equipment and effects for each gang vehicle using helper functions
      const vehiclesWithDetails = await Promise.all(
        (data || []).map(async (vehicle: any) => {
          const [equipment, effects] = await Promise.all([
            getVehicleEquipment(vehicle.id, supabase),
            getVehicleEffects(vehicle.id, supabase)
          ]);

          const equipmentCost = equipment.reduce((sum: number, eq: any) => sum + (eq.cost || 0), 0);
          const effectsCost = Object.values(effects).flat().reduce((sum: number, effect: any) => {
            return sum + (effect.type_specific_data?.credits_increase || 0);
          }, 0);

          return {
            id: vehicle.id,
            created_at: vehicle.created_at,
            vehicle_type_id: vehicle.vehicle_type_id,
            vehicle_type: vehicle.vehicle_type,
            cost: vehicle.cost,
            vehicle_name: vehicle.vehicle_name,
            movement: vehicle.movement,
            front: vehicle.front,
            side: vehicle.side,
            rear: vehicle.rear,
            hull_points: vehicle.hull_points,
            handling: vehicle.handling,
            save: vehicle.save,
            body_slots: vehicle.body_slots,
            drive_slots: vehicle.drive_slots,
            engine_slots: vehicle.engine_slots,
            body_slots_occupied: vehicle.body_slots_occupied,
            drive_slots_occupied: vehicle.drive_slots_occupied,
            engine_slots_occupied: vehicle.engine_slots_occupied,
            special_rules: vehicle.special_rules || [],
            equipment,
            total_equipment_cost: equipmentCost,
            effects,
            total_effect_credits: effectsCost
          };
        })
      );

      return vehiclesWithDetails;
    },
    [`base-gang-vehicles-${gangId}`],
    {
      tags: [CACHE_TAGS.BASE_GANG_VEHICLES(gangId)],
      revalidate: false
    }
  )();
};

// =============================================================================
// HELPER FUNCTIONS - Shared utility functions
// =============================================================================

/**
 * Get vehicle equipment (shared helper for gang and fighter vehicles)
 */
const getVehicleEquipment = async (vehicleId: string, supabase: any): Promise<any[]> => {
  const { data, error } = await supabase
    .from('fighter_equipment')
    .select(`
      id,
      equipment_id,
      custom_equipment_id,
      purchase_cost,
      is_master_crafted,
      equipment:equipment_id (
        equipment_name,
        equipment_type,
        equipment_category
      ),
      custom_equipment:custom_equipment_id (
        equipment_name,
        equipment_type,
        equipment_category
      )
    `)
    .eq('vehicle_id', vehicleId);

  if (error) return [];

  // Process equipment with weapon profiles
  const equipmentWithProfiles = await Promise.all(
    (data || []).map(async (item: any) => {
      const equipmentType = (item.equipment as any)?.equipment_type || (item.custom_equipment as any)?.equipment_type;
      let weaponProfiles: any[] = [];

      if (equipmentType === 'weapon') {
        if (item.equipment_id) {
          const { data: profiles } = await supabase
            .from('weapon_profiles')
            .select('*')
            .eq('weapon_id', item.equipment_id)
            .order('sort_order', { nullsFirst: false })
            .order('profile_name');

          weaponProfiles = (profiles || []).map((profile: any) => ({
            ...profile,
            is_master_crafted: item.is_master_crafted || false
          }));
        } else if (item.custom_equipment_id) {
          const { data: profiles } = await supabase
            .from('custom_weapon_profiles')
            .select('*')
            .or(`custom_equipment_id.eq.${item.custom_equipment_id},weapon_group_id.eq.${item.custom_equipment_id}`)
            .order('sort_order', { nullsFirst: false })
            .order('profile_name');

          weaponProfiles = (profiles || []).map((profile: any) => ({
            ...profile,
            is_master_crafted: item.is_master_crafted || false
          }));
        }
      }

      return {
        vehicle_weapon_id: item.id,
        equipment_id: item.equipment_id || item.custom_equipment_id,
        custom_equipment_id: item.custom_equipment_id,
        equipment_name: (item.equipment as any)?.equipment_name || (item.custom_equipment as any)?.equipment_name || 'Unknown',
        equipment_type: equipmentType || 'unknown',
        equipment_category: (item.equipment as any)?.equipment_category || (item.custom_equipment as any)?.equipment_category || 'unknown',
        cost: item.purchase_cost || 0,
        weapon_profiles: weaponProfiles
      };
    })
  );

  return equipmentWithProfiles;
};

/**
 * Get vehicle effects (shared helper for gang and fighter vehicles)
 */
const getVehicleEffects = async (vehicleId: string, supabase: any): Promise<Record<string, any[]>> => {
  const { data, error } = await supabase
    .from('fighter_effects')
    .select(`
      id,
      effect_name,
      type_specific_data,
      created_at,
      updated_at,
      fighter_effect_type:fighter_effect_type_id (
        fighter_effect_category:fighter_effect_category_id (
          category_name
        )
      ),
      fighter_effect_modifiers (
        id,
        fighter_effect_id,
        stat_name,
        numeric_value
      )
    `)
    .eq('vehicle_id', vehicleId);

  if (error) return {};

  const effectsByCategory: Record<string, any[]> = {};
  
  (data || []).forEach((effectData: any) => {
    const categoryName = (effectData.fighter_effect_type as any)?.fighter_effect_category?.category_name || 'uncategorized';
    
    if (!effectsByCategory[categoryName]) {
      effectsByCategory[categoryName] = [];
    }

    effectsByCategory[categoryName].push({
      id: effectData.id,
      effect_name: effectData.effect_name,
      type_specific_data: effectData.type_specific_data,
      created_at: effectData.created_at,
      updated_at: effectData.updated_at,
      fighter_effect_modifiers: effectData.fighter_effect_modifiers || [],
    });
  });

  return effectsByCategory;
};

/**
 * Get username from user_id
 * Cache: BASE_USER_PROFILE
 */
export const getUserProfile = async (userId: string, supabase: any): Promise<{ username: string } | null> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', userId)
        .single();

      if (error) return null;
      return data;
    },
    [`user-profile-${userId}`],
    {
      tags: [CACHE_TAGS.BASE_USER_PROFILE(userId)],
      revalidate: false
    }
  )();
};