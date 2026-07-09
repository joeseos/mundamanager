import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { assembleGangFighters, assembleGangVehicles, type GangFightersBundle } from './gang-assembly';
import { BITTER_ENMITY_EFFECT_NAME } from '@/utils/bitterEnmityDisplay';
import { WeaponProps, WargearItem } from '@/types/fighter';
import { WeaponProfile } from '@/types/equipment';
import { applyWeaponModifiers } from '@/utils/effect-modifiers';
import { DefaultImageEntry, normaliseDefaultImageUrls } from '@/types/gang';

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
  alignment: string;
  note?: string;
  note_backstory?: string;
  note_private?: string;
  note_private_updated_at?: string;
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
  custom_gang_type_id?: string | null;
  custom_gang_types?: null;
  image_url?: string;
  default_gang_image?: number | null;
  hidden: boolean;
}

export interface GangType {
  id: string;
  gang_type: string;
  image_url: string;
  default_image_urls?: DefaultImageEntry[];
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
  cost_resource?: { name: string; amount: number } | null;
}

export interface GangCampaignResource {
  resource_id: string;
  resource_name: string;
  quantity: number;
  is_custom: boolean;
}

export interface GangCampaign {
  campaign_id: string;
  campaign_gang_id: string;
  campaign_name: string;
  role: string;
  status: string;
  invited_at?: string;
  invited_by?: string;
  trading_posts?: string[] | null;
  trading_post_names?: string[];
  custom_trading_posts?: string[] | null;
  custom_trading_post_names?: string[];
  territories: any[];
  allegiance?: {
    id: string;
    name: string;
  } | null;
  // New normalised resources from campaign_gang_resources
  resources: GangCampaignResource[];
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
  loadout_cost?: number; // Cost of equipment in active loadout only (for fighter card display)
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
  owner_id?: string;
  owner_name?: string;
  beast_equipment_stashed?: boolean;
  active_loadout_id?: string;
  active_loadout_name?: string;
  /** When true, this entry represents the fighter's in-game active loadout (used for print filtering) */
  isActiveLoadoutForPrint?: boolean;
}

// =============================================================================
// BASE DATA FUNCTIONS - Raw database queries with proper cache tags
// =============================================================================

export interface GangCore extends GangBasic {
  credits: number;
  rating: number;
  wealth: number;
  alliance: Alliance | null;
}

/**
 * Get the full gang row (basic info + credits + rating + wealth + alliance).
 * One cache entry and one query replace the previous four parallel gangs-row
 * reads (basic/credits/rating-wealth) plus the alliance lookup. Positioning
 * is deliberately excluded — it changes on every drag and has its own entry.
 * Cache: gang-{id}
 */
export const getGangCore = async (gangId: string, supabase: any): Promise<GangCore | null> => {
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
          alignment,
          note,
          note_backstory,
          note_private,
          note_private_updated_at,
          created_at,
          last_updated,
          credits,
          rating,
          wealth,
          alliance_id,
          alliance:alliance_id (
            id,
            alliance_name,
            alliance_type
          ),
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
          custom_gang_type_id,
          image_url,
          default_gang_image,
          hidden
        `)
        .eq('id', gangId)
        .maybeSingle();

      if (error) {
        // Return null for invalid UUID format; maybeSingle returns null for no rows.
        if (error.code === '22P02') return null;
        throw error;
      }
      if (!data) return null;
      return {
        ...data,
        rating: (data.rating ?? 0) as number,
        wealth: (data.wealth ?? 0) as number,
        alliance: data.alliance ?? null,
      };
    },
    [`gang-core-v2-${gangId}`],
    {
      tags: [CACHE_TAGS.BASE_GANG_BASIC(gangId)],
      revalidate: false
    }
  )();
};

/**
 * Get gang basic information — selector over getGangCore (same cache entry).
 */
export const getGangBasic = async (gangId: string, supabase: any): Promise<GangBasic | null> => {
  return getGangCore(gangId, supabase);
};

/**
 * Get gang credits only — selector over getGangCore (same cache entry).
 */
export const getGangCredits = async (gangId: string, supabase: any): Promise<number> => {
  const core = await getGangCore(gangId, supabase);
  if (!core) throw new Error('Gang not found');
  return core.credits;
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
    [`gang-positioning-v2-${gangId}`],
    {
      tags: [CACHE_TAGS.BASE_GANG_POSITIONING(gangId)],
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
          cost_resource,
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
        type: 'equipment' as const,
        cost_resource: item.cost_resource ?? null
      }));
    },
    [`gang-stash-v2-${gangId}`],
    {
      tags: [CACHE_TAGS.BASE_GANG_STASH(gangId)],
      revalidate: false
    }
  )();
};

/**
 * Get gang type information, resolving between system and custom gang types
 * Cache: GLOBAL_GANG_TYPES (shared, 1 hour revalidation)
 */
export const getGangType = async (gangBasic: GangBasic, supabase: any): Promise<GangType> => {
  if (gangBasic.custom_gang_type_id) {
    return unstable_cache(
      async () => {
        const { data, error } = await supabase
          .from('custom_gang_types')
          .select('id, gang_type, default_image_urls')
          .eq('id', gangBasic.custom_gang_type_id)
          .single();

        if (error) throw error;
        return {
          id: data.id,
          gang_type: data.gang_type,
          image_url: '',
          default_image_urls: normaliseDefaultImageUrls(data.default_image_urls)
        };
      },
      [`custom-gang-type-${gangBasic.custom_gang_type_id}`],
      {
        tags: [CACHE_TAGS.GLOBAL_GANG_TYPES()],
        revalidate: 3600
      }
    )();
  }

  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('gang_types')
        .select('gang_type_id, gang_type, image_url, default_image_urls')
        .eq('gang_type_id', gangBasic.gang_type_id)
        .single();

      if (error) throw error;
      return {
        id: data.gang_type_id,
        gang_type: data.gang_type,
        image_url: data.image_url,
        default_image_urls: normaliseDefaultImageUrls(data.default_image_urls)
      };
    },
    [`gang-type-${gangBasic.gang_type_id}`],
    {
      tags: [CACHE_TAGS.GLOBAL_GANG_TYPES()],
      revalidate: 3600
    }
  )();
};

/**
 * Resolves gang type config (affiliation, origin category) from whichever type applies
 */
export const getGangTypeConfig = (gangBasic: GangBasic) =>
  gangBasic.gang_types ?? gangBasic.custom_gang_types ?? null;

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
          id,
          user_id,
          campaign_type_allegiance_id,
          campaign_allegiance_id,
          campaign_members!campaign_member_id (
            role,
            status,
            invited_at,
            invited_by
          ),
          campaigns!campaign_id (
            id,
            campaign_name,
            campaign_type_id,
            trading_posts,
            custom_trading_posts
          )
        `)
        .eq('gang_id', gangId);

      if (error) {
        console.error('Error fetching gang campaigns:', error);
        return [];
      }

      // Get all campaign IDs and campaign_gang IDs first
      const campaignIds = (data || [])
        .map((cg: any) => (cg.campaigns as any)?.id)
        .filter(Boolean);
      
      const campaignGangIds = (data || [])
        .map((cg: any) => cg.id)
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
          playing_card,
          description,
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

      // Collect all custom trading post IDs across all campaigns for batch fetch
      const allCustomTradingPostIds = (data || [])
        .map((cg: any) => (cg.campaigns as any)?.custom_trading_posts)
        .filter((tp: any) => tp && Array.isArray(tp) && tp.length > 0)
        .flat();

      let customTradingPostNamesMap: Record<string, string> = {};
      if (allCustomTradingPostIds.length > 0) {
        const uniqueIds = Array.from(new Set(allCustomTradingPostIds));
        const { data: customTradingPosts } = await supabase
          .from('custom_trading_posts')
          .select('id, custom_trading_post_name')
          .in('id', uniqueIds);

        if (customTradingPosts) {
          customTradingPostNamesMap = customTradingPosts.reduce((acc: Record<string, string>, tp: any) => {
            acc[tp.id] = tp.custom_trading_post_name;
            return acc;
          }, {});
        }
      }

      // Collect all allegiance IDs for batch fetch
      const customAllegianceIds = (data || [])
        .map((cg: any) => cg.campaign_allegiance_id)
        .filter(Boolean);
      const typeAllegianceIds = (data || [])
        .map((cg: any) => cg.campaign_type_allegiance_id)
        .filter(Boolean);

      // Batch fetch allegiance names
      let allegianceNamesMap: Record<string, string> = {};
      
      if (customAllegianceIds.length > 0) {
        const { data: customAllegiances } = await supabase
          .from('campaign_allegiances')
          .select('id, allegiance_name')
          .in('id', customAllegianceIds);

        if (customAllegiances) {
          customAllegiances.forEach((a: any) => {
            allegianceNamesMap[a.id] = a.allegiance_name;
          });
        }
      }

      if (typeAllegianceIds.length > 0) {
        const { data: typeAllegiances } = await supabase
          .from('campaign_type_allegiances')
          .select('id, allegiance_name')
          .in('id', typeAllegianceIds);

        if (typeAllegiances) {
          typeAllegiances.forEach((a: any) => {
            allegianceNamesMap[a.id] = a.allegiance_name;
          });
        }
      }

      // Fetch ALL available resources for campaigns and gang's current quantities
      let resourcesByCampaignGang: Record<string, GangCampaignResource[]> = {};
      
      if (campaignGangIds.length > 0 && campaignIds.length > 0) {
        // Get campaign_type_ids for fetching predefined resources
        const campaignTypeIds = (data || [])
          .map((cg: any) => (cg.campaigns as any)?.campaign_type_id)
          .filter(Boolean);
        
        // Fetch predefined resources for all campaign types
        let predefinedResources: Array<{ id: string; resource_name: string; campaign_type_id: string }> = [];
        if (campaignTypeIds.length > 0) {
          const { data: typeResources } = await supabase
            .from('campaign_type_resources')
            .select('id, resource_name, campaign_type_id')
            .in('campaign_type_id', campaignTypeIds);
          predefinedResources = typeResources || [];
        }
        
        // Fetch custom resources for all campaigns
        let customResources: Array<{ id: string; resource_name: string; campaign_id: string }> = [];
        if (campaignIds.length > 0) {
          const { data: campResources } = await supabase
            .from('campaign_resources')
            .select('id, resource_name, campaign_id')
            .in('campaign_id', campaignIds);
          customResources = campResources || [];
        }
        
        // Fetch gang's current resource quantities
        const { data: gangResources } = await supabase
          .from('campaign_gang_resources')
          .select(`
            id,
            campaign_gang_id,
            campaign_type_resource_id,
            campaign_resource_id,
            quantity
          `)
          .in('campaign_gang_id', campaignGangIds);
        
        // Build quantity lookup: resourceId -> { campaignGangId -> quantity }
        const quantityLookup: Record<string, Record<string, number>> = {};
        (gangResources || []).forEach((gr: any) => {
          const resourceId = gr.campaign_type_resource_id || gr.campaign_resource_id;
          if (resourceId) {
            if (!quantityLookup[resourceId]) {
              quantityLookup[resourceId] = {};
            }
            quantityLookup[resourceId][gr.campaign_gang_id] = Number(gr.quantity) || 0;
          }
        });
        
        // Build resources for each campaign_gang
        for (const cg of data || []) {
          const campaignGangId = cg.id;
          const campaignTypeId = (cg.campaigns as any)?.campaign_type_id;
          const campaignId = (cg.campaigns as any)?.id;
          
          if (!resourcesByCampaignGang[campaignGangId]) {
            resourcesByCampaignGang[campaignGangId] = [];
          }
          
          // Add predefined resources for this campaign's type
          const relevantPredefined = predefinedResources.filter(r => r.campaign_type_id === campaignTypeId);
          for (const resource of relevantPredefined) {
            const quantity = quantityLookup[resource.id]?.[campaignGangId] || 0;
            resourcesByCampaignGang[campaignGangId].push({
              resource_id: resource.id,
              resource_name: resource.resource_name,
              quantity,
              is_custom: false
            });
          }
          
          // Add custom resources for this campaign
          const relevantCustom = customResources.filter(r => r.campaign_id === campaignId);
          for (const resource of relevantCustom) {
            const quantity = quantityLookup[resource.id]?.[campaignGangId] || 0;
            resourcesByCampaignGang[campaignGangId].push({
              resource_id: resource.id,
              resource_name: resource.resource_name,
              quantity,
              is_custom: true
            });
          }
        }
      }

      // Batch the member fallback: rows whose embedded campaign_members join
      // returned no role used to trigger one awaited query per campaign inside
      // the loop below. Fetch all candidate entries in a single query instead.
      type MemberEntry = { campaign_id?: string; user_id?: string; role: string; status: string | null; invited_at: string; invited_by: string };
      const fallbackRows = (data || []).filter(
        (cg: any) => cg.campaigns && (!cg.campaign_members || !(cg.campaign_members as any)?.role)
      );
      const fallbackMembersByPair: Record<string, MemberEntry[]> = {};
      if (fallbackRows.length > 0) {
        const { data: allMemberEntries } = await supabase
          .from('campaign_members')
          .select('campaign_id, user_id, role, status, invited_at, invited_by')
          .in('campaign_id', Array.from(new Set(fallbackRows.map((cg: any) => (cg.campaigns as any).id))))
          .in('user_id', Array.from(new Set(fallbackRows.map((cg: any) => (cg as any).user_id))));

        for (const entry of (allMemberEntries || []) as MemberEntry[]) {
          const key = `${entry.campaign_id}:${entry.user_id}`;
          (fallbackMembersByPair[key] ||= []).push(entry);
        }
      }

      for (const cg of data || []) {
        if (cg.campaigns) {
          // Get member data - need to consider ALL entries for this user in
          // this campaign to determine the highest role (in case they have
          // multiple gangs)
          let memberData = cg.campaign_members;

          if (!memberData || !(memberData as any)?.role) {
            const entries = fallbackMembersByPair[`${(cg.campaigns as any).id}:${(cg as any).user_id}`];
            if (entries && entries.length > 0) {
              // Find the highest role (OWNER > ARBITRATOR > MEMBER)
              const roleHierarchy: Record<string, number> = {
                'OWNER': 3,
                'ARBITRATOR': 2,
                'MEMBER': 1
              };

              memberData = entries.reduce((highest: MemberEntry, current: MemberEntry) => {
                const currentRank = roleHierarchy[current.role] || 0;
                const highestRank = roleHierarchy[highest.role] || 0;
                return currentRank > highestRank ? current : highest;
              }, entries[0]);
            }
          }

          // Get trading post names for this campaign
          const tradingPosts = (cg.campaigns as any).trading_posts || [];
          const trading_post_names = tradingPosts
            .map((id: string) => tradingPostNamesMap[id])
            .filter(Boolean);

          const customTradingPosts = (cg.campaigns as any).custom_trading_posts || [];
          const custom_trading_post_names = customTradingPosts
            .map((id: string) => customTradingPostNamesMap[id])
            .filter(Boolean);

          // Get allegiance (custom takes precedence over type)
          const allegianceId = (cg as any).campaign_allegiance_id || (cg as any).campaign_type_allegiance_id;
          const allegiance = allegianceId && allegianceNamesMap[allegianceId]
            ? { id: allegianceId, name: allegianceNamesMap[allegianceId] }
            : null;

          campaigns.push({
            campaign_id: (cg.campaigns as any).id,
            campaign_gang_id: cg.id,
            campaign_name: (cg.campaigns as any).campaign_name,
            role: (memberData as any)?.role,
            status: (memberData as any)?.status,
            invited_at: (memberData as any)?.invited_at,
            invited_by: (memberData as any)?.invited_by,
            trading_posts: tradingPosts,
            trading_post_names,
            custom_trading_posts: customTradingPosts,
            custom_trading_post_names,
            territories: territoriesByCampaign[(cg.campaigns as any).id] || [],
            allegiance,
            resources: resourcesByCampaignGang[cg.id] || []
          });
        }
      }

      return campaigns;
    },
    [`gang-campaigns-v2-${gangId}`],
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
 * Get stored gang rating and wealth — selector over getGangCore (same cache entry).
 */
export const getGangRatingAndWealth = async (gangId: string, supabase: any): Promise<{ rating: number; wealth: number }> => {
  const core = await getGangCore(gangId, supabase);
  if (!core) throw new Error('Gang not found');
  return { rating: core.rating, wealth: core.wealth };
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
    [`gang-fighter-count-v2-${gangId}`],
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
    [`gang-beast-count-v2-${gangId}`],
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
export interface GetGangFightersListOptions {
  expandLoadoutsForPrint?: boolean;
}

/**
 * Fetch the raw gang fighters bundle: every fighter/vehicle-shaped row for a
 * gang in ONE cache entry (tag gang-{id}) filled by two round-trip stages of
 * wide batched queries. Page-specific shapes are produced by the pure
 * assemble* functions in gang-assembly.ts.
 *
 * Stage 1 (parallel): fighters, ALL gang vehicles (both keyed by gang_id)
 * Stage 2 (parallel): equipment (fighter + vehicle rows in one query),
 *   skills, effects (fighter + vehicle scopes in one query), exotic beasts
 *   (both directions), loadouts (+assignments embedded), captured-by names
 */
export const getGangFightersBundle = async (gangId: string, supabase: any): Promise<GangFightersBundle> => {
  return unstable_cache(
    async () => {
      // Stage 1: fighters and ALL gang vehicles in parallel
      const [fightersRes, vehiclesRes] = await Promise.all([
        supabase
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
            captured_by_gang_id,
            free_skill,
            kills,
            kill_count,
            fighter_pet_id,
            image_url,
            position,
            active_loadout_id,
            fighter_types!fighter_type_id (
              fighter_type,
              alliance_crew_name,
              cost,
              is_spyrer
            ),
            fighter_sub_types!fighter_sub_type_id (
              id,
              sub_type_name
            )
          `)
          .eq('gang_id', gangId),
        supabase
          .from('vehicles')
          .select(`
            id,
            gang_id,
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
            body_slots_occupied,
            drive_slots_occupied,
            engine_slots_occupied,
            special_rules,
            vehicle_name,
            vehicle_type_id,
            vehicle_type,
            cost
          `)
          .eq('gang_id', gangId)
      ]);

      const fighters = fightersRes.error ? [] : (fightersRes.data || []);
      const vehicles = vehiclesRes.error ? [] : (vehiclesRes.data || []);

      const emptyBundle: GangFightersBundle = {
        gangId,
        fighters,
        vehicles,
        equipment: [],
        skills: [],
        effects: [],
        beastsOwned: [],
        beastsPetOf: [],
        loadouts: [],
        capturedByGangs: []
      };

      if (fighters.length === 0 && vehicles.length === 0) {
        return emptyBundle;
      }

      const fighterIds = fighters.map((f: any) => f.id);
      const vehicleIds = vehicles.map((v: any) => v.id);

      const equipmentSelect = `
        id,
        fighter_id,
        vehicle_id,
        equipment_id,
        custom_equipment_id,
        purchase_cost,
        is_master_crafted,
        equipment:equipment_id (
          equipment_name,
          equipment_type,
          equipment_category,
          weapon_profiles (
            id,
            weapon_id,
            weapon_group_id,
            profile_name,
            range_short,
            range_long,
            acc_short,
            acc_long,
            strength,
            ap,
            damage,
            ammo,
            traits,
            sort_order
          )
        ),
        custom_equipment:custom_equipment_id (
          equipment_name,
          equipment_type,
          equipment_category,
          custom_weapon_profiles (
            id,
            custom_equipment_id,
            weapon_group_id,
            profile_name,
            range_short,
            range_long,
            acc_short,
            acc_long,
            strength,
            ap,
            damage,
            ammo,
            traits,
            sort_order
          )
        )
      `;

      const effectsSelect = `
        id,
        fighter_id,
        vehicle_id,
        fighter_equipment_id,
        target_equipment_id,
        fighter_effect_type_id,
        effect_name,
        type_specific_data,
        sort_order,
        created_at,
        updated_at,
        fighter_effect_type:fighter_effect_type_id (
          sort_order,
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
      `;

      // Equipment: fighter-held (vehicle_id null) + vehicle-mounted, one query
      const equipmentQuery = (() => {
        let q = supabase.from('fighter_equipment').select(equipmentSelect);
        if (fighterIds.length > 0 && vehicleIds.length > 0) {
          return q.or(`and(fighter_id.in.(${fighterIds.join(',')}),vehicle_id.is.null),vehicle_id.in.(${vehicleIds.join(',')})`);
        }
        if (fighterIds.length > 0) {
          return q.in('fighter_id', fighterIds).is('vehicle_id', null);
        }
        return q.in('vehicle_id', vehicleIds);
      })();

      // Effects: fighter-scoped + vehicle-scoped, one query (partitioned at assembly)
      const effectsQuery = (() => {
        let q = supabase.from('fighter_effects').select(effectsSelect);
        if (fighterIds.length > 0 && vehicleIds.length > 0) {
          q = q.or(`fighter_id.in.(${fighterIds.join(',')}),vehicle_id.in.(${vehicleIds.join(',')})`);
        } else if (fighterIds.length > 0) {
          q = q.in('fighter_id', fighterIds);
        } else {
          q = q.in('vehicle_id', vehicleIds);
        }
        return q.order('sort_order', { ascending: true, nullsFirst: false });
      })();

      const capturedByGangIds = Array.from(
        new Set(fighters.filter((f: any) => f.captured_by_gang_id).map((f: any) => f.captured_by_gang_id))
      );

      // Stage 2: everything else in parallel
      const [
        equipmentRes,
        skillsRes,
        effectsRes,
        beastsOwnedRes,
        beastsPetOfRes,
        loadoutsRes,
        capturedByGangsRes
      ] = await Promise.all([
        equipmentQuery,
        fighterIds.length > 0
          ? supabase
              .from('fighter_skills')
              .select(`
                id,
                fighter_id,
                credits_increase,
                xp_cost,
                is_advance,
                fighter_effect_skill_id,
                custom_skill_id,
                created_at,
                skill:skill_id (
                  name
                ),
                custom_skill:custom_skill_id (
                  skill_name
                ),
                fighter_effect_skills!fighter_effect_skill_id (
                  fighter_effects (
                    effect_name,
                    type_specific_data
                  )
                )
              `)
              .in('fighter_id', fighterIds)
          : Promise.resolve({ data: [] }),
        effectsQuery,
        fighterIds.length > 0
          ? supabase
              .from('fighter_exotic_beasts')
              .select('fighter_owner_id, fighter_pet_id')
              .in('fighter_owner_id', fighterIds)
          : Promise.resolve({ data: [] }),
        fighterIds.length > 0
          ? supabase
              .from('fighter_exotic_beasts')
              .select(`
                id,
                fighter_pet_id,
                fighter_owner_id,
                fighter_equipment_id,
                fighters!fighter_owner_id (
                  fighter_name
                ),
                fighter_equipment!fighter_equipment_id (
                  gang_stash
                )
              `)
              .in('fighter_pet_id', fighterIds)
          : Promise.resolve({ data: [] }),
        fighterIds.length > 0
          ? supabase
              .from('fighter_loadouts')
              .select('id, fighter_id, loadout_name, created_at, fighter_loadout_equipment (loadout_id, fighter_equipment_id)')
              .in('fighter_id', fighterIds)
              .order('created_at', { ascending: true })
          : Promise.resolve({ data: [] }),
        capturedByGangIds.length > 0
          ? supabase.from('gangs').select('id, name').in('id', capturedByGangIds)
          : Promise.resolve({ data: [] })
      ]);

      return {
        gangId,
        fighters,
        vehicles,
        equipment: equipmentRes.data || [],
        skills: skillsRes.data || [],
        effects: effectsRes.data || [],
        beastsOwned: beastsOwnedRes.data || [],
        beastsPetOf: beastsPetOfRes.data || [],
        loadouts: loadoutsRes.data || [],
        capturedByGangs: capturedByGangsRes.data || []
      };
    },
    [`gang-fighters-bundle-v2-${gangId}`],
    {
      tags: [CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(gangId)],
      revalidate: false
    }
  )();
};

/**
 * Get all fighters in a gang with complete data — selector over
 * getGangFightersBundle. The print expansion is an assembly option over the
 * same cache entry (previously a separate duplicate entry).
 */
export const getGangFightersList = async (
  gangId: string,
  supabase: any,
  options?: GetGangFightersListOptions
): Promise<GangFighter[]> => {
  const bundle = await getGangFightersBundle(gangId, supabase);
  return assembleGangFighters(bundle, options);
};

/**
 * Get gang vehicles (not assigned to specific fighters) — selector over
 * getGangFightersBundle (same cache entry as the fighters list).
 */
export const getGangVehicles = async (gangId: string, supabase: any): Promise<any[]> => {
  const bundle = await getGangFightersBundle(gangId, supabase);
  return assembleGangVehicles(bundle);
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
    [`user-profile-v2-${userId}`],
    {
      tags: [CACHE_TAGS.BASE_USER_PROFILE(userId)],
      revalidate: false
    }
  )();
};

export interface OoaBreakdownItem {
  fighter_name: string;
  fighter_type: string;
  fighter_class: string;
  kills: number;
}

export interface DeathsBreakdownItem {
  fighter_name: string;
  fighter_type: string;
  fighter_class: string;
}

export interface GangFighterStats {
  ooa_caused: number;
  deaths_suffered: number;
  ooa_breakdown: OoaBreakdownItem[];
  deaths_breakdown: DeathsBreakdownItem[];
}

export const getGangFighterStats = async (
  gangId: string,
  supabase: any
): Promise<GangFighterStats> => {
  return unstable_cache(
    async () => {
      const { data: fighters, error } = await supabase
        .from('fighters')
        .select('fighter_name, fighter_type, fighter_class, kills, killed')
        .eq('gang_id', gangId);

      if (error) throw error;

      const fighterList = fighters || [];
      const ooaCaused = fighterList.reduce(
        (sum: number, f: { kills: number }) => sum + (Number(f.kills) || 0),
        0
      );
      const deathsSuffered = fighterList.filter(
        (f: { killed: boolean }) => f.killed === true
      ).length;

      const ooaBreakdown: OoaBreakdownItem[] = fighterList
        .filter((f: { kills: number }) => (Number(f.kills) || 0) > 0)
        .map((f: { fighter_name: string; fighter_type?: string; fighter_class?: string; kills: number }) => ({
          fighter_name: f.fighter_name || 'Unknown',
          fighter_type: f.fighter_type || '—',
          fighter_class: f.fighter_class || '—',
          kills: Number(f.kills) || 0
        }))
        .sort((a: OoaBreakdownItem, b: OoaBreakdownItem) => b.kills - a.kills);

      const deathsBreakdown: DeathsBreakdownItem[] = fighterList
        .filter((f: { killed: boolean }) => f.killed === true)
        .map((f: { fighter_name: string; fighter_type?: string; fighter_class?: string }) => ({
          fighter_name: f.fighter_name || 'Unknown',
          fighter_type: f.fighter_type || '—',
          fighter_class: f.fighter_class || '—'
        }));

      return {
        ooa_caused: ooaCaused,
        deaths_suffered: deathsSuffered,
        ooa_breakdown: ooaBreakdown,
        deaths_breakdown: deathsBreakdown
      };
    },
    [`gang-fighter-stats-v2-${gangId}`],
    {
      tags: [CACHE_TAGS.COMPUTED_GANG_FIGHTER_STATS(gangId)],
      revalidate: false
    }
  )();
};