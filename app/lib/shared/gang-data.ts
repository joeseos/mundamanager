import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { WeaponProps, WargearItem } from '@/types/fighter';
import { applyWeaponModifiers } from '@/utils/effect-modifiers';

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
  power: number;
  sustenance: number;
  salvage: number;
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
  gang_origin_id?: string | null;
  gang_origin?: {
    id: string;
    origin_name: string;
    gang_origin_categories?: {
      category_name: string;
    } | null;
  } | null;
  gang_types?: {
    affiliation: boolean;
    gang_origin_category_id?: string;
    gang_origin_categories?: {
      category_name: string;
    } | null;
  } | null;
  image_url?: string;
  hidden: boolean;
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
  invited_by?: string;
  has_meat: boolean;
  has_exploration_points: boolean;
  has_scavenging_rolls: boolean;
  has_power: boolean;
  has_sustenance: boolean;
  has_salvage: boolean;
  trading_posts?: string[] | null;
  trading_post_names?: string[];
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
  weapons: WeaponProps[];
  wargear: WargearItem[];
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
export const getGangBasic = async (gangId: string, supabase: any): Promise<GangBasic | null> => {
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
          power,
          sustenance,
          salvage,
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
          gang_origin_id,
          gang_origin:gang_origin_id (
            id,
            origin_name,
            gang_origin_categories!gang_origin_category_id (
              category_name
            )
          ),
          gang_types!gang_type_id(
            affiliation,
            gang_origin_category_id,
            gang_origin_categories!gang_origin_category_id (
              category_name
            )
          ),
          image_url,
          hidden
        `)
        .eq('id', gangId)
        .single();

      if (error) {
        // Return null for not found errors or invalid UUID format
        if (error.code === 'PGRST116' || error.code === '22P02') return null;
        throw error;
      }
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
 * DEPRECATED: Get gang resources (meat, reputation, scavenging_rolls, exploration_points)
 * Use getGangBasic() instead - it includes all these fields
 * Cache: BASE_GANG_BASIC
 */
// export const getGangResources = async (gangId: string, supabase: any): Promise<{
//   meat: number;
//   reputation: number;
//   scavenging_rolls: number;
//   exploration_points: number;
//   power: number;
//   sustenance: number;
//   salvage: number;
// }> => {
//   return unstable_cache(
//     async () => {
//       const { data, error } = await supabase
//         .from('gangs')
//         .select('meat, reputation, scavenging_rolls, exploration_points, power, sustenance, salvage')
//         .eq('id', gangId)
//         .single();

//       if (error) throw error;
//       return data;
//     },
//     [`gang-resources-${gangId}`],
//     {
//       tags: [CACHE_TAGS.BASE_GANG_RESOURCES(gangId)],
//       revalidate: false
//     }
//   )();
// };

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
 * Helper function to group array items by a key
 */
function groupBy<T extends Record<string, any>>(
  array: T[],
  key: string
): Record<string, T[]> {
  return array.reduce((acc, item) => {
    const groupKey = String(item[key]);
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

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
          user_id,
          campaign_members!campaign_member_id (
            role,
            status,
            invited_at,
            invited_by
          ),
          campaigns!campaign_id (
            id,
            campaign_name,
            has_meat,
            has_exploration_points,
            has_scavenging_rolls,
            has_power,
            has_sustenance,
            has_salvage,
            trading_posts
          )
        `)
        .eq('gang_id', gangId);

      if (error) {
        console.error('Error fetching gang campaigns:', error);
        return [];
      }

      // Get all campaign IDs first
      const campaignIds = (data || [])
        .map((cg: any) => (cg.campaigns as any)?.id)
        .filter(Boolean);

      // Single batch query for all territories
      const { data: allTerritories } = await supabase
        .from('campaign_territories')
        .select(`
          id,
          campaign_id,
          created_at,
          territory_id,
          territory_name,
          ruined,
          default_gang_territory
        `)
        .in('campaign_id', campaignIds)
        .eq('gang_id', gangId);

      // Create lookup map
      const territoriesByCampaign = groupBy(allTerritories || [], 'campaign_id');

      const campaigns: GangCampaign[] = [];

      // Collect all trading post IDs across all campaigns for batch fetch
      const allTradingPostIds = (data || [])
        .map((cg: any) => (cg.campaigns as any)?.trading_posts)
        .filter((tp: any) => tp && Array.isArray(tp) && tp.length > 0)
        .flat();

      // Batch fetch trading post names
      let tradingPostNamesMap: Record<string, string> = {};
      if (allTradingPostIds.length > 0) {
        const uniqueIds = Array.from(new Set(allTradingPostIds));
        const { data: tradingPostTypes } = await supabase
          .from('trading_post_types')
          .select('id, trading_post_name')
          .in('id', uniqueIds);

        if (tradingPostTypes) {
          tradingPostNamesMap = tradingPostTypes.reduce((acc: Record<string, string>, tp: any) => {
            acc[tp.id] = tp.trading_post_name;
            return acc;
          }, {});
        }
      }

      for (const cg of data || []) {
        if (cg.campaigns) {
          // Get member data - need to fetch ALL entries for this user in this campaign
          // to determine the highest role (in case they have multiple gangs)
          let memberData = cg.campaign_members;

          if (!memberData || !(memberData as any)?.role) {
            // Fallback: query all campaign_members entries for this user in this campaign
            const { data: allMemberEntries } = await supabase
              .from('campaign_members')
              .select('role, status, invited_at, invited_by')
              .eq('campaign_id', (cg.campaigns as any).id)
              .eq('user_id', (cg as any).user_id);

            if (allMemberEntries && allMemberEntries.length > 0) {
              // Find the highest role (OWNER > ARBITRATOR > MEMBER)
              const roleHierarchy: Record<string, number> = {
                'OWNER': 3,
                'ARBITRATOR': 2,
                'MEMBER': 1
              };

              type MemberEntry = { role: string; status: string | null; invited_at: string; invited_by: string };
              memberData = allMemberEntries.reduce((highest: MemberEntry, current: MemberEntry) => {
                const currentRank = roleHierarchy[current.role] || 0;
                const highestRank = roleHierarchy[highest.role] || 0;
                return currentRank > highestRank ? current : highest;
              }, allMemberEntries[0]);
            }
          }

          // Get trading post names for this campaign
          const tradingPosts = (cg.campaigns as any).trading_posts || [];
          const trading_post_names = tradingPosts
            .map((id: string) => tradingPostNamesMap[id])
            .filter(Boolean);

          campaigns.push({
            campaign_id: (cg.campaigns as any).id,
            campaign_name: (cg.campaigns as any).campaign_name,
            role: (memberData as any)?.role,
            status: (memberData as any)?.status,
            invited_at: (memberData as any)?.invited_at,
            invited_by: (memberData as any)?.invited_by,
            has_meat: (cg.campaigns as any).has_meat,
            has_exploration_points: (cg.campaigns as any).has_exploration_points,
            has_scavenging_rolls: (cg.campaigns as any).has_scavenging_rolls,
            has_power: (cg.campaigns as any).has_power,
            has_sustenance: (cg.campaigns as any).has_sustenance,
            has_salvage: (cg.campaigns as any).has_salvage,
            trading_posts: tradingPosts,
            trading_post_names,
            territories: territoriesByCampaign[(cg.campaigns as any).id] || []
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
 * Get stored gang rating and wealth from columns (gangs.rating, gangs.wealth)
 * Cache: COMPUTED_GANG_RATING + SHARED_GANG_RATING
 */
export const getGangRatingAndWealth = async (gangId: string, supabase: any): Promise<{ rating: number; wealth: number }> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('gangs')
        .select('rating, wealth')
        .eq('id', gangId)
        .single();

      if (error) throw error;
      return {
        rating: (data?.rating ?? 0) as number,
        wealth: (data?.wealth ?? 0) as number
      };
    },
    [`gang-rating-wealth-${gangId}`],
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
 * Get stored gang rating from column (gangs.rating)
 * Cache: COMPUTED_GANG_RATING + SHARED_GANG_RATING
 * @deprecated Use getGangRatingAndWealth() for better performance (single query)
 */
export const getGangRating = async (gangId: string, supabase: any): Promise<number> => {
  const { rating } = await getGangRatingAndWealth(gangId, supabase);
  return rating;
};

/**
 * Get stored gang wealth from column (gangs.wealth)
 * Cache: COMPUTED_GANG_RATING + SHARED_GANG_RATING
 * @deprecated Use getGangRatingAndWealth() for better performance (single query)
 */
export const getGangWealth = async (gangId: string, supabase: any): Promise<number> => {
  const { wealth } = await getGangRatingAndWealth(gangId, supabase);
  return wealth;
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
 * Get all fighters in a gang with complete data (BATCHED QUERIES)
 *
 * Uses batched database queries to minimize round trips:
 * - Single query for all fighters with joins for types/sub-types
 * - Batch query for all equipment (WHERE fighter_id IN (...))
 * - Batch query for all skills
 * - Batch query for all effects
 * - Batch query for all vehicles
 * - Batch query for beast relationships
 *
 * Target: ~8 queries total regardless of fighter count (vs ~100+ with N+1 pattern)
 */
export const getGangFightersList = async (gangId: string, supabase: any): Promise<GangFighter[]> => {
  return unstable_cache(
    async () => {
      // Step 1: Fetch ALL fighters for the gang in ONE query with joins
      const { data: fighters, error: fightersError } = await supabase
        .from('fighters')
        .select(`
          id,
          fighter_name,
          label,
          note,
          note_backstory,
          credits,
          cost_adjustment,
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
          xp,
          special_rules,
          fighter_class,
          fighter_class_id,
          fighter_type,
          fighter_type_id,
          custom_fighter_type_id,
          fighter_gang_legacy_id,
          fighter_gang_legacy:fighter_gang_legacy_id (
            id,
            fighter_type_id,
            name
          ),
          fighter_sub_type_id,
          killed,
          starved,
          retired,
          enslaved,
          recovery,
          captured,
          free_skill,
          kills,
          kill_count,
          fighter_pet_id,
          image_url,
          position,
          fighter_types!fighter_type_id (
            fighter_type,
            alliance_crew_name,
            cost
          ),
          fighter_sub_types!fighter_sub_type_id (
            id,
            sub_type_name
          )
        `)
        .eq('gang_id', gangId);

      if (fightersError || !fighters || fighters.length === 0) {
        return [];
      }

      // Extract all fighter IDs for batch queries
      const fighterIds = fighters.map((f: any) => f.id);

      // Step 2: Batch fetch ALL related data in parallel
      const [
        allEquipment,
        allSkills,
        allEffects,
        allVehicles,
        allBeastRelationships,
        allBeastOwnershipInfo,
        allEquipmentTargetingEffects
      ] = await Promise.all([
        // Batch fetch all equipment for all fighters
        supabase
          .from('fighter_equipment')
          .select(`
            id,
            fighter_id,
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
          .in('fighter_id', fighterIds)
          .is('vehicle_id', null),

        // Batch fetch all skills for all fighters
        supabase
          .from('fighter_skills')
          .select(`
            id,
            fighter_id,
            credits_increase,
            xp_cost,
            is_advance,
            fighter_effect_skill_id,
            created_at,
            skill:skill_id (
              name
            ),
            fighter_effect_skills!fighter_effect_skill_id (
              fighter_effects (
                effect_name
              )
            )
          `)
          .in('fighter_id', fighterIds),

        // Batch fetch all effects for all fighters
        supabase
          .from('fighter_effects')
          .select(`
            id,
            fighter_id,
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
              numeric_value,
              operation
            )
          `)
          .in('fighter_id', fighterIds)
          .is('vehicle_id', null),

        // Batch fetch all vehicles for all fighters
        supabase
          .from('vehicles')
          .select(`
            id,
            fighter_id,
            created_at,
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
            special_rules,
            vehicle_name,
            vehicle_type_id,
            vehicle_type,
            cost
          `)
          .in('fighter_id', fighterIds),

        // Batch fetch beast relationships (fighters that own other fighters)
        supabase
          .from('fighter_exotic_beasts')
          .select('fighter_owner_id, fighter_pet_id')
          .in('fighter_owner_id', fighterIds),

        // Batch fetch beast ownership info (for fighters that ARE owned)
        supabase
          .from('fighter_exotic_beasts')
          .select(`
            id,
            fighter_pet_id,
            fighter_equipment_id,
            fighters!fighter_owner_id (
              fighter_name
            ),
            fighter_equipment!fighter_equipment_id (
              gang_stash
            )
          `)
          .in('fighter_pet_id', fighterIds),

        // Batch fetch effects that target equipment (with modifiers for weapon profile modifications)
        // fighter_equipment_id: which equipment receives the effect (target)
        // target_equipment_id: which equipment adds the effect (source, for equipment-to-equipment effects)
        supabase
          .from('fighter_effects')
          .select(`
            id,
            fighter_effect_type_id,
            effect_name,
            type_specific_data,
            fighter_equipment_id,
            target_equipment_id,
            fighter_effect_modifiers ( stat_name, numeric_value, operation )
          `)
          .in('fighter_id', fighterIds)
          .not('fighter_equipment_id', 'is', null)
      ]);

      // Step 3: Fetch weapon profiles in batch for all weapons found
      const allStandardEquipmentIds = (allEquipment.data || [])
        .filter((item: any) => item.equipment_id && ((item.equipment as any)?.equipment_type === 'weapon'))
        .map((item: any) => item.equipment_id);

      const allCustomEquipmentIds = (allEquipment.data || [])
        .filter((item: any) => item.custom_equipment_id && ((item.custom_equipment as any)?.equipment_type === 'weapon'))
        .map((item: any) => item.custom_equipment_id);

      const [standardProfiles, customProfiles] = await Promise.all([
        allStandardEquipmentIds.length > 0
          ? supabase
              .from('weapon_profiles')
              .select('*')
              .or(`weapon_id.in.(${allStandardEquipmentIds.join(',')}),weapon_group_id.in.(${allStandardEquipmentIds.join(',')})`)
              .order('sort_order', { nullsFirst: false })
              .order('profile_name')
          : Promise.resolve({ data: [] }),

        allCustomEquipmentIds.length > 0
          ? supabase
              .from('custom_weapon_profiles')
              .select('*')
              .or(`custom_equipment_id.in.(${allCustomEquipmentIds.join(',')}),weapon_group_id.in.(${allCustomEquipmentIds.join(',')})`)
              .order('sort_order', { nullsFirst: false })
              .order('profile_name')
          : Promise.resolve({ data: [] })
      ]);

      // Step 3.5: Batch fetch vehicle equipment and effects for cost calculation
      const vehicleIds = (allVehicles.data || []).map((v: any) => v.id);
      const [allVehicleEquipment, allVehicleEffects] = await Promise.all([
        vehicleIds.length > 0
          ? supabase
              .from('fighter_equipment')
              .select(`
                id,
                vehicle_id,
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
              .in('vehicle_id', vehicleIds)
          : Promise.resolve({ data: [] }),

        vehicleIds.length > 0
          ? supabase
              .from('fighter_effects')
              .select(`
                id,
                vehicle_id,
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
                  numeric_value,
                  operation
                )
              `)
              .in('vehicle_id', vehicleIds)
          : Promise.resolve({ data: [] })
      ]);

      // Step 3.6: Batch fetch weapon profiles for vehicle weapons
      const vehicleStandardWeaponIds = (allVehicleEquipment.data || [])
        .filter((item: any) => item.equipment_id && (item.equipment?.equipment_type === 'weapon'))
        .map((item: any) => item.equipment_id);

      const vehicleCustomWeaponIds = (allVehicleEquipment.data || [])
        .filter((item: any) => item.custom_equipment_id && (item.custom_equipment?.equipment_type === 'weapon'))
        .map((item: any) => item.custom_equipment_id);

      const [vehicleStandardProfiles, vehicleCustomProfiles] = await Promise.all([
        vehicleStandardWeaponIds.length > 0
          ? supabase
              .from('weapon_profiles')
              .select('*')
              .or(`weapon_id.in.(${vehicleStandardWeaponIds.join(',')}),weapon_group_id.in.(${vehicleStandardWeaponIds.join(',')})`)
              .order('sort_order', { nullsFirst: false })
              .order('profile_name')
          : Promise.resolve({ data: [] }),
        vehicleCustomWeaponIds.length > 0
          ? supabase
              .from('custom_weapon_profiles')
              .select('*')
              .or(`custom_equipment_id.in.(${vehicleCustomWeaponIds.join(',')}),weapon_group_id.in.(${vehicleCustomWeaponIds.join(',')})`)
              .order('sort_order', { nullsFirst: false })
              .order('profile_name')
          : Promise.resolve({ data: [] })
      ]);

      // Build vehicle weapon profile maps - BASE PROFILES ONLY (no ammo merging)
      const vehicleStandardProfilesMap = new Map<string, any[]>();
      (vehicleStandardProfiles.data || []).forEach((profile: any) => {
        if (!vehicleStandardProfilesMap.has(profile.weapon_id)) {
          vehicleStandardProfilesMap.set(profile.weapon_id, []);
        }
        vehicleStandardProfilesMap.get(profile.weapon_id)!.push(profile);
      });

      const vehicleStandardAmmoByParent = new Map<string, any[]>();
      (vehicleStandardProfiles.data || []).forEach((profile: any) => {
        if (profile.weapon_group_id && profile.weapon_group_id !== profile.weapon_id) {
          if (!vehicleStandardAmmoByParent.has(profile.weapon_group_id)) {
            vehicleStandardAmmoByParent.set(profile.weapon_group_id, []);
          }
          vehicleStandardAmmoByParent.get(profile.weapon_group_id)!.push(profile);
        }
      });

      const vehicleCustomProfilesMap = new Map<string, any[]>();
      (vehicleCustomProfiles.data || []).forEach((profile: any) => {
        if (!vehicleCustomProfilesMap.has(profile.custom_equipment_id)) {
          vehicleCustomProfilesMap.set(profile.custom_equipment_id, []);
        }
        vehicleCustomProfilesMap.get(profile.custom_equipment_id)!.push(profile);
      });

      const vehicleCustomAmmoByParent = new Map<string, any[]>();
      (vehicleCustomProfiles.data || []).forEach((profile: any) => {
        if (profile.weapon_group_id && profile.weapon_group_id !== profile.custom_equipment_id) {
          if (!vehicleCustomAmmoByParent.has(profile.weapon_group_id)) {
            vehicleCustomAmmoByParent.set(profile.weapon_group_id, []);
          }
          vehicleCustomAmmoByParent.get(profile.weapon_group_id)!.push(profile);
        }
      });

      // Step 4: Create lookup Maps for O(1) access
      const equipmentByFighter = groupBy(allEquipment.data || [], 'fighter_id');
      const skillsByFighter = groupBy(allSkills.data || [], 'fighter_id');
      const effectsByFighter = groupBy(allEffects.data || [], 'fighter_id');
      const vehiclesByFighter = groupBy(allVehicles.data || [], 'fighter_id');
      const beastsByOwner = groupBy(allBeastRelationships.data || [], 'fighter_owner_id');

      // Create ownership info map (petId -> ownership info)
      const ownershipInfoMap = new Map();
      (allBeastOwnershipInfo.data || []).forEach((info: any) => {
        ownershipInfoMap.set(info.fighter_pet_id, {
          owner_name: (info.fighters as any)?.fighter_name,
          beast_equipment_stashed: info.fighter_equipment?.gang_stash || false
        });
      });

      // Create equipment targeting effects map (targetEquipmentId -> effects with modifiers)
      // Two cases:
      // 1. Rig glitches: fighter_equipment_id = target weapon, target_equipment_id = NULL
      // 2. Equipment-to-equipment (e.g., hotshot laspack): fighter_equipment_id = source, target_equipment_id = target weapon
      const equipmentTargetingEffectsMap = new Map<string, any[]>();
      const equipmentTargetingEffectNamesMap = new Map<string, string[]>();
      (allEquipmentTargetingEffects.data || []).forEach((effect: any) => {
        // Use target_equipment_id if present (equipment-to-equipment), otherwise fighter_equipment_id (rig glitches)
        const targetId = effect.target_equipment_id || effect.fighter_equipment_id;
        if (!targetId) return;
        
        if (!equipmentTargetingEffectsMap.has(targetId)) {
          equipmentTargetingEffectsMap.set(targetId, []);
          equipmentTargetingEffectNamesMap.set(targetId, []);
        }
        equipmentTargetingEffectsMap.get(targetId)!.push(effect);
        // Collect unique effect names
        const existingNames = equipmentTargetingEffectNamesMap.get(targetId)!;
        if (effect.effect_name && !existingNames.includes(effect.effect_name)) {
          existingNames.push(effect.effect_name);
        }
      });

      // Create fighter lookup map for O(1) beast lookups
      const fighterLookup = new Map(fighters.map((f: any) => [f.id, f]));

      // Create weapon profiles maps - BASE PROFILES ONLY (no ammo merging)
      const standardProfilesMap = new Map<string, any[]>();
      (standardProfiles.data || []).forEach((profile: any) => {
        // ONLY map by direct weapon_id - no weapon_group_id merging here
        if (!standardProfilesMap.has(profile.weapon_id)) {
          standardProfilesMap.set(profile.weapon_id, []);
        }
        standardProfilesMap.get(profile.weapon_id)!.push(profile);
      });

      // Create separate map for ammo/accessory profiles indexed by parent weapon
      const standardAmmoByParentWeapon = new Map<string, any[]>();
      (standardProfiles.data || []).forEach((profile: any) => {
        if (profile.weapon_group_id && profile.weapon_group_id !== profile.weapon_id) {
          if (!standardAmmoByParentWeapon.has(profile.weapon_group_id)) {
            standardAmmoByParentWeapon.set(profile.weapon_group_id, []);
          }
          standardAmmoByParentWeapon.get(profile.weapon_group_id)!.push(profile);
        }
      });

      const customProfilesMap = new Map<string, any[]>();
      (customProfiles.data || []).forEach((profile: any) => {
        // ONLY map by direct custom_equipment_id - no weapon_group_id merging here
        if (!customProfilesMap.has(profile.custom_equipment_id)) {
          customProfilesMap.set(profile.custom_equipment_id, []);
        }
        customProfilesMap.get(profile.custom_equipment_id)!.push(profile);
      });

      // Create separate map for custom ammo/accessory profiles indexed by parent weapon
      const customAmmoByParentWeapon = new Map<string, any[]>();
      (customProfiles.data || []).forEach((profile: any) => {
        if (profile.weapon_group_id && profile.weapon_group_id !== profile.custom_equipment_id) {
          if (!customAmmoByParentWeapon.has(profile.weapon_group_id)) {
            customAmmoByParentWeapon.set(profile.weapon_group_id, []);
          }
          customAmmoByParentWeapon.get(profile.weapon_group_id)!.push(profile);
        }
      });

      // Step 5: Transform each fighter using pre-fetched data
      return fighters.map((fighter: any) => {
        try {
          const fighterId = fighter.id;

          // Get fighter-specific data from Maps
          const equipment = equipmentByFighter[fighterId] || [];
          const skillsData = skillsByFighter[fighterId] || [];
          const effectsData = effectsByFighter[fighterId] || [];
          const vehicles = vehiclesByFighter[fighterId] || [];
          const ownedBeasts = beastsByOwner[fighterId] || [];
          const ownershipInfo = fighter.fighter_pet_id ? ownershipInfoMap.get(fighter.fighter_pet_id) : null;

        // Process skills into the expected format
        const skills: Record<string, any> = {};
        skillsData.forEach((skillData: any) => {
          const skillName = (skillData.skill as any)?.name;
          if (skillName) {
            const injuryName = skillData.fighter_effect_skills?.fighter_effects?.effect_name;
            skills[skillName] = {
              id: skillData.id,
              name: skillName,
              credits_increase: skillData.credits_increase || 0,
              xp_cost: skillData.xp_cost || 0,
              is_advance: skillData.is_advance || false,
              fighter_injury_id: skillData.fighter_effect_skill_id || undefined,
              injury_name: injuryName || undefined,
              acquired_at: skillData.created_at
            };
          }
        });

        // Process effects into the expected format (grouped by category)
        const effects: Record<string, any[]> = {};
        effectsData.forEach((effectData: any) => {
          const categoryName = (effectData.fighter_effect_type as any)?.fighter_effect_category?.category_name || 'uncategorized';
          if (!effects[categoryName]) {
            effects[categoryName] = [];
          }
          effects[categoryName].push({
            id: effectData.id,
            effect_name: effectData.effect_name,
            type_specific_data: effectData.type_specific_data,
            created_at: effectData.created_at,
            updated_at: effectData.updated_at,
            fighter_effect_modifiers: effectData.fighter_effect_modifiers || []
          });
        });

        // Get THIS fighter's equipment IDs for ammo ownership check
        const fighterStandardIds = new Set(
          equipment.filter((e: any) => e.equipment_id).map((e: any) => e.equipment_id)
        );
        const fighterCustomIds = new Set(
          equipment.filter((e: any) => e.custom_equipment_id).map((e: any) => e.custom_equipment_id)
        );

        // Process equipment and add weapon profiles
        const processedEquipment = equipment.map((item: any) => {
          const equipmentType = (item.equipment as any)?.equipment_type || (item.custom_equipment as any)?.equipment_type;
          let weaponProfiles: any[] = [];

          if (equipmentType === 'weapon') {
            if (item.equipment_id) {
              // Get base profiles for this weapon
              const baseProfiles = standardProfilesMap.get(item.equipment_id) || [];

              // Get ammo profiles ONLY if THIS fighter owns the ammo
              const ammoProfiles = (standardAmmoByParentWeapon.get(item.equipment_id) || [])
                .filter((p: any) => fighterStandardIds.has(p.weapon_id));

              // Combine and deduplicate
              const seenIds = new Set<string>();
              weaponProfiles = [...baseProfiles, ...ammoProfiles]
                .filter((p: any) => {
                  if (seenIds.has(p.id)) return false;
                  seenIds.add(p.id);
                  return true;
                })
                .map((profile: any) => ({
                  ...profile,
                  is_master_crafted: item.is_master_crafted || false
                }));
            } else if (item.custom_equipment_id) {
              // Get base profiles for this custom weapon
              const baseProfiles = customProfilesMap.get(item.custom_equipment_id) || [];

              // Get ammo profiles ONLY if THIS fighter owns the ammo
              const ammoProfiles = (customAmmoByParentWeapon.get(item.custom_equipment_id) || [])
                .filter((p: any) => fighterCustomIds.has(p.custom_equipment_id));

              // Combine and deduplicate
              const seenIds = new Set<string>();
              weaponProfiles = [...baseProfiles, ...ammoProfiles]
                .filter((p: any) => {
                  if (seenIds.has(p.id)) return false;
                  seenIds.add(p.id);
                  return true;
                })
                .map((profile: any) => ({
                  ...profile,
                  is_master_crafted: item.is_master_crafted || false
                }));
            }
          }

          // Apply equipment-targeted effect modifiers to weapon profiles
          if (weaponProfiles.length > 0) {
            const targetingEffects = equipmentTargetingEffectsMap.get(item.id) || [];
            if (targetingEffects.length > 0) {
              weaponProfiles = applyWeaponModifiers(weaponProfiles, targetingEffects);
            }
          }

          // Get effect names that target this equipment
          const effect_names = equipmentTargetingEffectNamesMap.get(item.id) || [];

          return {
            fighter_equipment_id: item.id,
            equipment_id: item.equipment_id || undefined,
            custom_equipment_id: item.custom_equipment_id || undefined,
            equipment_name: (item.equipment as any)?.equipment_name || (item.custom_equipment as any)?.equipment_name || 'Unknown',
            equipment_type: equipmentType || 'unknown',
            equipment_category: (item.equipment as any)?.equipment_category || (item.custom_equipment as any)?.equipment_category || 'unknown',
            purchase_cost: item.purchase_cost || 0,
            is_master_crafted: item.is_master_crafted || false,
            weapon_profiles: weaponProfiles,
            effect_names: effect_names.length > 0 ? effect_names : undefined
          };
        });

        // Calculate beast costs (fighters owned by this fighter)
        const beastCosts = ownedBeasts.reduce((total: number, beastRel: any) => {
          // Find the beast fighter using O(1) lookup
          const beastFighter: any = fighterLookup.get(beastRel.fighter_pet_id);
          if (!beastFighter || beastFighter.killed || beastFighter.retired || beastFighter.enslaved || beastFighter.captured) {
            return total;
          }

          // Get beast's equipment, skills, effects
          const beastEquipment = equipmentByFighter[beastRel.fighter_pet_id] || [];
          const beastSkills = skillsByFighter[beastRel.fighter_pet_id] || [];
          const beastEffects = effectsByFighter[beastRel.fighter_pet_id] || [];

          const equipmentCost = beastEquipment.reduce((sum: number, eq: any) => sum + (eq.purchase_cost || 0), 0);
          const skillsCost = beastSkills.reduce((sum: number, skill: any) => sum + (skill.credits_increase || 0), 0);
          const effectsCost = beastEffects.reduce((sum: number, effect: any) => {
            return sum + (effect.type_specific_data?.credits_increase || 0);
          }, 0);

          const baseBeastCost = (beastFighter.fighter_types as any)?.cost || 0;

          return total + baseBeastCost + equipmentCost + skillsCost + effectsCost + (beastFighter.cost_adjustment || 0);
        }, 0);

        // Calculate total cost
        let totalCost = 0;
        const isOwnedBeast = !!ownershipInfo;

        // Process vehicles with equipment and effects for display
        const processedVehicles = vehicles.map((vehicle: any) => {
          // Get THIS vehicle's equipment IDs for ammo ownership check
          const vehicleEquipmentData = (allVehicleEquipment.data || []).filter((e: any) => e.vehicle_id === vehicle.id);
          const vehicleStandardIds = new Set(
            vehicleEquipmentData.filter((e: any) => e.equipment_id).map((e: any) => e.equipment_id)
          );
          const vehicleCustomIds = new Set(
            vehicleEquipmentData.filter((e: any) => e.custom_equipment_id).map((e: any) => e.custom_equipment_id)
          );

          // Process equipment with weapon profiles
          const vehicleEquipment = vehicleEquipmentData.map((item: any) => {
            const equipmentType = item.equipment?.equipment_type || item.custom_equipment?.equipment_type;
            let weaponProfiles: any[] = [];

            if (equipmentType === 'weapon') {
              if (item.equipment_id) {
                const baseProfiles = vehicleStandardProfilesMap.get(item.equipment_id) || [];
                const ammoProfiles = (vehicleStandardAmmoByParent.get(item.equipment_id) || [])
                  .filter((p: any) => vehicleStandardIds.has(p.weapon_id));

                const seenIds = new Set<string>();
                weaponProfiles = [...baseProfiles, ...ammoProfiles]
                  .filter((p: any) => {
                    if (seenIds.has(p.id)) return false;
                    seenIds.add(p.id);
                    return true;
                  })
                  .map((profile: any) => ({ ...profile, is_master_crafted: item.is_master_crafted || false }));
              } else if (item.custom_equipment_id) {
                const baseProfiles = vehicleCustomProfilesMap.get(item.custom_equipment_id) || [];
                const ammoProfiles = (vehicleCustomAmmoByParent.get(item.custom_equipment_id) || [])
                  .filter((p: any) => vehicleCustomIds.has(p.custom_equipment_id));

                const seenIds = new Set<string>();
                weaponProfiles = [...baseProfiles, ...ammoProfiles]
                  .filter((p: any) => {
                    if (seenIds.has(p.id)) return false;
                    seenIds.add(p.id);
                    return true;
                  })
                  .map((profile: any) => ({ ...profile, is_master_crafted: item.is_master_crafted || false }));
              }
            }

            return {
              vehicle_weapon_id: item.id,
              equipment_id: item.equipment_id || item.custom_equipment_id,
              custom_equipment_id: item.custom_equipment_id,
              equipment_name: item.equipment?.equipment_name || item.custom_equipment?.equipment_name || 'Unknown',
              equipment_type: equipmentType || 'unknown',
              equipment_category: item.equipment?.equipment_category || item.custom_equipment?.equipment_category || 'unknown',
              purchase_cost: item.purchase_cost || 0,
              weapon_profiles: weaponProfiles
            };
          });

          // Process effects grouped by category
          const vehicleEffectsData = (allVehicleEffects.data || []).filter((e: any) => e.vehicle_id === vehicle.id);
          const vehicleEffects: Record<string, any[]> = {};
          vehicleEffectsData.forEach((effectData: any) => {
            const categoryName = effectData.fighter_effect_type?.fighter_effect_category?.category_name || 'uncategorized';
            if (!vehicleEffects[categoryName]) {
              vehicleEffects[categoryName] = [];
            }
            vehicleEffects[categoryName].push({
              id: effectData.id,
              effect_name: effectData.effect_name,
              type_specific_data: effectData.type_specific_data,
              created_at: effectData.created_at,
              updated_at: effectData.updated_at,
              fighter_effect_modifiers: effectData.fighter_effect_modifiers || []
            });
          });

          return {
            ...vehicle,
            equipment: vehicleEquipment,
            effects: vehicleEffects
          };
        });

        if (!isOwnedBeast) {
          const equipmentCost = processedEquipment.reduce((sum: number, eq: any) => sum + eq.purchase_cost, 0);
          const skillsCost = Object.values(skills).reduce((sum: number, skill: any) => sum + skill.credits_increase, 0);
          const effectsCost = Object.values(effects).flat().reduce((sum: number, effect: any) => {
            return sum + (effect.type_specific_data?.credits_increase || 0);
          }, 0);

          // Calculate vehicle costs including equipment and effects
          const vehicleCost = processedVehicles.reduce((sum: number, vehicle: any) => {
            let vehicleTotal = vehicle.cost || 0;

            if (vehicle.equipment) {
              vehicleTotal += vehicle.equipment.reduce((equipSum: number, eq: any) => {
                return equipSum + (eq.purchase_cost || 0);
              }, 0);
            }

            if (vehicle.effects) {
              vehicleTotal += Object.values(vehicle.effects).flat().reduce((effectSum: number, effect: any) => {
                return effectSum + ((effect as any).type_specific_data?.credits_increase || 0);
              }, 0);
            }

            return sum + vehicleTotal;
          }, 0);

          totalCost = fighter.credits + equipmentCost + skillsCost + effectsCost + vehicleCost +
                      (fighter.cost_adjustment || 0) + beastCosts;
        }

        // Separate equipment into weapons and wargear
        const weapons: WeaponProps[] = processedEquipment
          .filter((item: any) => item.equipment_type === 'weapon')
          .map((item: any) => ({
            fighter_weapon_id: item.fighter_equipment_id,
            weapon_id: item.equipment_id || item.custom_equipment_id || '',
            weapon_name: item.equipment_name,
            cost: item.purchase_cost || 0,
            weapon_profiles: item.weapon_profiles || [],
            is_master_crafted: item.is_master_crafted || false,
            equipment_category: item.equipment_category || undefined,
            effect_names: item.effect_names
          }));

        const wargear: WargearItem[] = processedEquipment
          .filter((item: any) => item.equipment_type === 'wargear')
          .map((item: any) => ({
            fighter_weapon_id: item.fighter_equipment_id,
            wargear_id: item.equipment_id || item.custom_equipment_id || '',
            wargear_name: item.equipment_name,
            cost: item.purchase_cost || 0,
            is_master_crafted: item.is_master_crafted || false
          }));

        // Get fighter type info from the join
        const fighterTypeInfo = fighter.fighter_types || {};
        const fighterSubTypeInfo = fighter.fighter_sub_types || null;

        return {
          id: fighter.id,
          fighter_name: fighter.fighter_name,
          label: fighter.label,
          fighter_type: fighter.fighter_type || fighterTypeInfo.fighter_type || 'Unknown',
          fighter_class: fighter.fighter_class || 'Unknown',
          fighter_sub_type: fighterSubTypeInfo ? {
            fighter_sub_type: fighterSubTypeInfo.sub_type_name,
            fighter_sub_type_id: fighterSubTypeInfo.id
          } : undefined,
          alliance_crew_name: fighterTypeInfo.alliance_crew_name,
          position: fighter.position,
          xp: fighter.xp,
          kills: fighter.kills || 0,
          credits: totalCost,
          movement: fighter.movement,
          weapon_skill: fighter.weapon_skill,
          ballistic_skill: fighter.ballistic_skill,
          strength: fighter.strength,
          toughness: fighter.toughness,
          wounds: fighter.wounds,
          initiative: fighter.initiative,
          attacks: fighter.attacks,
          leadership: fighter.leadership,
          cool: fighter.cool,
          willpower: fighter.willpower,
          intelligence: fighter.intelligence,
          weapons,
          wargear,
          effects,
          skills,
          vehicles: processedVehicles,
          cost_adjustment: fighter.cost_adjustment,
          special_rules: fighter.special_rules || [],
          note: fighter.note,
          killed: fighter.killed || false,
          starved: fighter.starved || false,
          retired: fighter.retired || false,
          enslaved: fighter.enslaved || false,
          recovery: fighter.recovery || false,
          captured: fighter.captured || false,
          free_skill: fighter.free_skill || false,
          image_url: fighter.image_url,
          owner_name: ownershipInfo?.owner_name,
          beast_equipment_stashed: ownershipInfo?.beast_equipment_stashed || false
        };
        } catch (error) {
          console.error(`Error processing fighter ${fighter.id}:`, error);
          return null;
        }
      }).filter((f: any): f is NonNullable<typeof f> => f !== null);
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
        numeric_value,
        operation
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
 * Get username and patreon tier from user_id
 * Cache: BASE_USER_PROFILE
 */
export const getUserProfile = async (userId: string, supabase: any): Promise<{ 
  username: string;
  patreon_tier_id?: string;
  patreon_tier_title?: string;
  patron_status?: string;
} | null> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('username, patreon_tier_id, patreon_tier_title, patron_status')
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