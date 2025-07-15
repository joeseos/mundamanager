import { createClient } from "@/utils/supabase/server";
import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CACHE_TAGS } from '@/utils/cache-tags';

// Type definitions
interface CampaignBasic {
  id: string;
  campaign_name: string;
  campaign_type_id: string;
  status: string;
  description: string;
  created_at: string;
  updated_at: string;
  has_meat: boolean;
  has_exploration_points: boolean;
  has_scavenging_rolls: boolean;
  note: string;
  campaign_types: {
    campaign_type_name: string;
  } | null;
}

interface CampaignTriumph {
  id: string;
  triumph: string;
  criteria: string;
  campaign_type_id: string;
  created_at: string;
  updated_at: string | null;
}

interface Fighter {
  id: string;
  gang_id: string;
  credits: number;
  cost_adjustment: number;
  fighter_equipment?: { purchase_cost: number }[];
  fighter_skills?: { credits_increase: number }[];
  fighter_effects?: { type_specific_data: { credits_increase?: number } }[];
  vehicles?: {
    id: string;
    cost: number;
    fighter_equipment?: { purchase_cost: number }[];
    fighter_effects?: { type_specific_data: { credits_increase?: number } }[];
  }[];
}

interface GangVehicle {
  id: string;
  gang_id: string;
  cost: number;
  fighter_equipment?: { purchase_cost: number }[];
  fighter_effects?: { type_specific_data: { credits_increase?: number } }[];
}

interface Gang {
  id: string;
  name: string;
  gang_type_id: string;
  gang_colour: string;
  reputation: number;
  gang_types: {
    gang_type: string;
  } | null;
}

interface Profile {
  id: string;
  username: string;
  updated_at: string;
  user_role: string;
}

interface CampaignMember {
  id: string;
  user_id: string;
  role: string;
  status: string;
  invited_at: string;
  joined_at: string;
  invited_by: string;
  profiles: Profile | null;
}

interface CampaignGang {
  id: string;
  gang_id: string;
  user_id: string;
  campaign_member_id: string;
  status: string;
  gangs: Gang | null;
}

// No TTL - infinite cache with server action invalidation only
// Cache only expires when explicitly invalidated via revalidateTag()

// Internal helper functions (unchanged from original)
async function _getCampaignBasic(campaignId: string, supabase: SupabaseClient) {
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select(`
      id,
      campaign_name,
      campaign_type_id,
      status,
      description,
      created_at,
      updated_at,
      has_meat,
      has_exploration_points,
      has_scavenging_rolls,
      note
    `)
    .eq('id', campaignId)
    .single();

  if (campaignError) throw campaignError;

  let campaignTypeName = '';
  if (campaign.campaign_type_id) {
    const { data: campaignType, error: typeError } = await supabase
      .from('campaign_types')
      .select('campaign_type_name')
      .eq('id', campaign.campaign_type_id)
      .single();

    if (!typeError && campaignType) {
      campaignTypeName = campaignType.campaign_type_name;
    }
  }

  return {
    ...campaign,
    campaign_types: campaignTypeName ? { campaign_type_name: campaignTypeName } : null
  };
}

async function _getCampaignMembers(campaignId: string, supabase: SupabaseClient) {
  const { data: members, error: membersError } = await supabase
    .from('campaign_members')
    .select(`
      id,
      user_id,
      role,
      status,
      invited_at,
      joined_at,
      invited_by
    `)
    .eq('campaign_id', campaignId);

  if (membersError) throw membersError;

  const userIds = members?.map(m => m.user_id).filter(Boolean) || [];
  let profilesData: any[] = [];
  
  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select(`
        id,
        username,
        updated_at,
        user_role
      `)
      .in('id', userIds);

    if (!profilesError && profiles) {
      profilesData = profiles;
    }
  }

  const { data: campaignGangs, error: gangsError } = await supabase
    .from('campaign_gangs')
    .select(`
      id,
      gang_id,
      user_id,
      campaign_member_id,
      status
    `)
    .eq('campaign_id', campaignId);

  if (gangsError) throw gangsError;

  const gangIds = campaignGangs?.map(cg => cg.gang_id) || [];
  let gangsData: any[] = [];
  
  if (gangIds.length > 0) {
    const { data: gangs, error: gangsDetailError } = await supabase
      .from('gangs')
      .select(`
        id,
        name,
        gang_type,
        gang_colour,
        reputation,
        exploration_points,
        meat,
        scavenging_rolls
      `)
      .in('id', gangIds);

    if (gangsDetailError) throw gangsDetailError;
    gangsData = gangs || [];
  }

  let fightersData: any[] = [];
  let gangVehiclesData: any[] = [];
  
  if (gangIds.length > 0) {
    const { data: fighters, error: fightersError } = await supabase
      .from('fighters')
      .select(`
        id,
        gang_id,
        credits,
        cost_adjustment,
        fighter_equipment(purchase_cost),
        fighter_skills(credits_increase),
        fighter_effects(type_specific_data),
        vehicles(id, cost, fighter_equipment(purchase_cost), fighter_effects(type_specific_data))
      `)
      .in('gang_id', gangIds)
      .eq('killed', false)
      .eq('retired', false)
      .eq('enslaved', false);

    if (fightersError) throw fightersError;
    fightersData = fighters || [];

    // Fetch gang-owned vehicles (where fighter_id is NULL)
    const { data: gangVehicles, error: gangVehiclesError } = await supabase
      .from('vehicles')
      .select(`
        id,
        gang_id,
        cost,
        fighter_equipment(purchase_cost),
        fighter_effects(type_specific_data)
      `)
      .in('gang_id', gangIds)
      .is('fighter_id', null);

    if (gangVehiclesError) throw gangVehiclesError;
    gangVehiclesData = gangVehicles || [];
  }

  const gangRatings = new Map<string, number>();
  gangIds.forEach(gangId => {
    const gangFighters = fightersData.filter(f => f.gang_id === gangId);
    const gangOwnedVehicles = gangVehiclesData.filter(v => v.gang_id === gangId);
    
    // Calculate fighter ratings
    const fighterRating = gangFighters.reduce((sum, fighter) => {
      let individualFighterRating = (fighter.credits || 0) + (fighter.cost_adjustment || 0);
      
      // Fighter equipment
      if (fighter.fighter_equipment) {
        individualFighterRating += fighter.fighter_equipment.reduce((equipSum: number, eq: { purchase_cost: number }) => 
          equipSum + (eq.purchase_cost || 0), 0);
      }
      
      // Fighter skills  
      if (fighter.fighter_skills) {
        individualFighterRating += fighter.fighter_skills.reduce((skillSum: number, skill: { credits_increase: number }) => 
          skillSum + (skill.credits_increase || 0), 0);
      }
      
      // Fighter effects
      if (fighter.fighter_effects) {
        individualFighterRating += fighter.fighter_effects.reduce((effectSum: number, effect: { type_specific_data: { credits_increase?: number } }) => {
          const creditsIncrease = effect.type_specific_data?.credits_increase;
          return effectSum + (typeof creditsIncrease === 'number' ? creditsIncrease : 0);
        }, 0);
      }
      
      // Fighter-owned vehicles
      if (fighter.vehicles) {
        fighter.vehicles.forEach((vehicle: any) => {
          individualFighterRating += (vehicle.cost || 0);
          
          // Vehicle equipment
          if (vehicle.fighter_equipment) {
            individualFighterRating += vehicle.fighter_equipment.reduce((vehEqSum: number, eq: { purchase_cost: number }) => 
              vehEqSum + (eq.purchase_cost || 0), 0);
          }
          
          // Vehicle effects - MISSING in original implementation
          if (vehicle.fighter_effects) {
            individualFighterRating += vehicle.fighter_effects.reduce((vehEffectSum: number, effect: { type_specific_data: { credits_increase?: number } }) => {
              const creditsIncrease = effect.type_specific_data?.credits_increase;
              return vehEffectSum + (typeof creditsIncrease === 'number' ? creditsIncrease : 0);
            }, 0);
          }
        });
      }
      
      return sum + individualFighterRating;
    }, 0);

    // Gang-owned vehicles do NOT count toward gang rating
    // Only fighter-owned vehicles count (already included in fighterRating)
    
    // Total gang rating = fighters only (fighter-owned vehicles already included)
    const totalRating = fighterRating;
    gangRatings.set(gangId, totalRating);
  });

  const membersWithGangs = members?.map(member => {
    const memberProfile = profilesData.find(p => p.id === member.user_id);
    const memberGangs = campaignGangs?.filter(cg => 
      cg.campaign_member_id === member.id
    ) || [];

    const gangs = memberGangs.map(cg => {
      const gangDetails = gangsData.find(g => g.id === cg.gang_id);
      return {
        id: cg.id,
        gang_id: cg.gang_id,
        gang_name: gangDetails?.name || '',
        gang_type: gangDetails?.gang_type || '',
        gang_colour: gangDetails?.gang_colour || '#000000',
        status: cg.status,
        rating: gangRatings.get(cg.gang_id) || 0,
        reputation: gangDetails?.reputation || 0,
        campaign_member_id: cg.campaign_member_id,
        exploration_points: gangDetails?.exploration_points ?? null,
        meat: gangDetails?.meat ?? null,
        scavenging_rolls: gangDetails?.scavenging_rolls ?? null
      };
    });

    return {
      id: member.id,
      user_id: member.user_id,
      username: memberProfile?.username || '',
      role: member.role,
      status: member.status,
      invited_at: member.invited_at,
      joined_at: member.joined_at,
      invited_by: member.invited_by,
      profile: {
        id: memberProfile?.id || '',
        username: memberProfile?.username || '',
        updated_at: memberProfile?.updated_at || '',
        user_role: memberProfile?.user_role || ''
      },
      gangs
    };
  }) || [];

  return membersWithGangs;
}

async function _getCampaignTerritories(campaignId: string, supabase: SupabaseClient) {
  const { data: territories, error } = await supabase
    .from('campaign_territories')
    .select(`
      id,
      territory_id,
      territory_name,
      gang_id,
      created_at,
      ruined,
      default_gang_territory
    `)
    .eq('campaign_id', campaignId);

  if (error) throw error;

  const territoryGangIds = territories?.map(t => t.gang_id).filter(Boolean) || [];
  let territoryGangsData: any[] = [];
  
  if (territoryGangIds.length > 0) {
    const { data: gangs, error: gangsError } = await supabase
      .from('gangs')
      .select(`
        id,
        name,
        gang_type,
        gang_colour
      `)
      .in('id', territoryGangIds);

    if (!gangsError && gangs) {
      territoryGangsData = gangs;
    }
  }

  return territories?.map(territory => {
    const gangDetails = territoryGangsData.find(g => g.id === territory.gang_id);
    return {
      id: territory.id,
      territory_id: territory.territory_id,
      territory_name: territory.territory_name,
      gang_id: territory.gang_id,
      created_at: territory.created_at,
      ruined: territory.ruined || false,
      default_gang_territory: territory.default_gang_territory || false,
      owning_gangs: gangDetails ? [{
        id: gangDetails.id,
        name: gangDetails.name,
        gang_type: gangDetails.gang_type || '',
        gang_colour: gangDetails.gang_colour || '#000000'
      }] : []
    };
  }) || [];
}

async function _getCampaignBattles(campaignId: string, supabase: SupabaseClient, limit = 50) {
  const { data, error } = await supabase
    .from('campaign_battles')
    .select(`
      id,
      created_at,
      updated_at,
      scenario,
      attacker_id,
      defender_id,
      winner_id,
      note,
      participants,
      scenario_id
    `)
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const scenarioIds = data?.map(b => b.scenario_id).filter(Boolean) || [];
  let scenariosData: any[] = [];
  
  if (scenarioIds.length > 0) {
    const { data: scenarios, error: scenariosError } = await supabase
      .from('scenarios')
      .select('id, scenario_name, scenario_number')
      .in('id', scenarioIds);

    if (!scenariosError && scenarios) {
      scenariosData = scenarios;
    }
  }

  const gangIds = Array.from(new Set([
    ...data?.map(b => b.attacker_id).filter(Boolean) || [],
    ...data?.map(b => b.defender_id).filter(Boolean) || [],
    ...data?.map(b => b.winner_id).filter(Boolean) || []
  ]));

  let gangsData: { id: string; name: string; gang_colour: string }[] = [];
  if (gangIds.length > 0) {
    const { data: gangs, error: gangsError } = await supabase
      .from('gangs')
      .select('id, name, gang_colour')
      .in('id', gangIds);

    if (gangsError) throw gangsError;
    gangsData = gangs || [];
  }

  const gangMap = new Map(gangsData.map(gang => [gang.id, gang]));
  const scenarioMap = new Map(scenariosData.map(scenario => [scenario.id, scenario]));

  return data?.map(battle => {
    const scenarioDetails = scenarioMap.get(battle.scenario_id);
    return {
      id: battle.id,
      created_at: battle.created_at,
      updated_at: battle.updated_at,
      scenario: battle.scenario || scenarioDetails?.scenario_name || '',
      scenario_name: scenarioDetails?.scenario_name || '',
      scenario_number: scenarioDetails?.scenario_number || null,
      attacker_id: battle.attacker_id,
      defender_id: battle.defender_id,
      winner_id: battle.winner_id,
      note: battle.note,
      participants: battle.participants,
      attacker: battle.attacker_id ? {
        gang_id: battle.attacker_id,
        gang_name: gangMap.get(battle.attacker_id)?.name || 'Unknown'
      } : undefined,
      defender: battle.defender_id ? {
        gang_id: battle.defender_id,
        gang_name: gangMap.get(battle.defender_id)?.name || 'Unknown'
      } : undefined,
      winner: battle.winner_id ? {
        gang_id: battle.winner_id,
        gang_name: gangMap.get(battle.winner_id)?.name || 'Unknown'
      } : undefined
    };
  }) || [];
}

async function _getCampaignTriumphs(campaignTypeId: string, supabase: SupabaseClient) {
  const { data: triumphs, error } = await supabase
    .from('campaign_triumphs')
    .select(`
      id,
      triumph,
      criteria,
      campaign_type_id,
      created_at,
      updated_at
    `)
    .eq('campaign_type_id', campaignTypeId)
    .order('triumph', { ascending: true });

  if (error) throw error;

  return triumphs || [];
}

// 🚀 OPTIMIZED PUBLIC API FUNCTIONS USING unstable_cache()

/**
 * Get campaign basic information with persistent caching
 * Cache key: campaign-basic-{campaignId}
 * Invalidation: Server actions only via revalidateTag()
 */
export const getCampaignBasic = async (campaignId: string) => {
  const supabase = await createClient();
  return unstable_cache(
    async () => {
      return _getCampaignBasic(campaignId, supabase);
    },
    [`campaign-basic-${campaignId}`],
    {
      tags: ['campaign-basic', `campaign-basic-${campaignId}`, `campaign-${campaignId}`],
      revalidate: false
    }
  )();
};

/**
 * Get campaign members with gang-aware caching
 * Cache key: campaign-members-{campaignId}
 * Invalidation: Server actions + gang cache tags
 */
export const getCampaignMembers = async (campaignId: string) => {
  const supabase = await createClient();
  
  // First, get the gang IDs for this campaign to build cache tags
  const { data: campaignGangs } = await supabase
    .from('campaign_gangs')
    .select('gang_id')
    .eq('campaign_id', campaignId);
  
  const gangIds = campaignGangs?.map(cg => cg.gang_id) || [];
  
  // Build cache tags that include gang overview and rating tags
  const cacheTags = [
    'campaign-members', 
    `campaign-members-${campaignId}`, 
    `campaign-${campaignId}`,
    // Add gang cache tags so campaign data updates when gang data changes
    ...gangIds.map(gangId => CACHE_TAGS.GANG_OVERVIEW(gangId)),
    ...gangIds.map(gangId => CACHE_TAGS.GANG_RATING(gangId))
  ];
  
  return unstable_cache(
    async () => {
      return _getCampaignMembers(campaignId, supabase);
    },
    [`campaign-members-${campaignId}`],
    {
      tags: cacheTags,
      revalidate: false
    }
  )();
};

/**
 * Get campaign territories with persistent caching
 * Cache key: campaign-territories-{campaignId}
 * Invalidation: Server actions only via revalidateTag()
 */
export const getCampaignTerritories = async (campaignId: string) => {
  const supabase = await createClient();
  return unstable_cache(
    async () => {
      return _getCampaignTerritories(campaignId, supabase);
    },
    [`campaign-territories-${campaignId}`],
    {
      tags: ['campaign-territories', `campaign-territories-${campaignId}`, `campaign-${campaignId}`],
      revalidate: false
    }
  )();
};

/**
 * Get campaign battles with persistent caching
 * Cache key: campaign-battles-{campaignId}-{limit}
 * Invalidation: Server actions only via revalidateTag()
 */
export const getCampaignBattles = async (campaignId: string, limit = 50) => {
  const supabase = await createClient();
  return unstable_cache(
    async () => {
      return _getCampaignBattles(campaignId, supabase, limit);
    },
    [`campaign-battles-${campaignId}-${limit}`],
    {
      tags: ['campaign-battles', `campaign-battles-${campaignId}`, `campaign-${campaignId}`],
      revalidate: false
    }
  )();
};

/**
 * Get campaign triumphs with persistent caching
 * Cache key: campaign-triumphs-{campaignTypeId}
 * Invalidation: Server actions only via revalidateTag()
 */
export const getCampaignTriumphs = async (campaignTypeId: string) => {
  const supabase = await createClient();
  return unstable_cache(
    async () => {
      return _getCampaignTriumphs(campaignTypeId, supabase);
    },
    [`campaign-triumphs-${campaignTypeId}`],
    {
      tags: ['campaign-triumphs', `campaign-triumphs-${campaignTypeId}`],
      revalidate: false
    }
  )();
};

// 🎯 CACHE TAG UTILITIES

/**
 * Create campaign-specific cache tag
 * Usage: createCampaignTag('123', 'members') -> 'campaign-members-123'
 */
export function createCampaignTag(campaignId: string, type: 'basic' | 'members' | 'territories' | 'battles'): string {
  return `campaign-${type}-${campaignId}`;
}

/**
 * Create global campaign cache tag
 * Usage: createCampaignCacheTag('123') -> 'campaign-123'
 */
export function createCampaignCacheTag(campaignId: string): string {
  return `campaign-${campaignId}`;
}

/**
 * Create campaign type cache tag
 * Usage: createCampaignTypeTag('456') -> 'campaign-triumphs-456'
 */
export function createCampaignTypeTag(campaignTypeId: string): string {
  return `campaign-triumphs-${campaignTypeId}`;
}

// 🎯 REFERENCE DATA FUNCTIONS FOR TERRITORY MANAGEMENT

/**
 * Get all campaign types with persistent caching
 * Used by territory selection components
 */
export const getCampaignTypes = async () => {
  const supabase = await createClient();
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('campaign_types')
        .select('id, campaign_type_name')
        .order('campaign_type_name');
      
      if (error) throw error;
      return data || [];
    },
    ['campaign-types'],
    {
      tags: ['campaign-types'],
      revalidate: false
    }
  )();
};

/**
 * Get all territories with persistent caching
 * Used by territory selection components
 */
export const getAllTerritories = async () => {
  const supabase = await createClient();
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('territories')
        .select('id, territory_name, campaign_type_id')
        .order('territory_name');
      
      if (error) throw error;
      return data || [];
    },
    ['territories-list'],
    {
      tags: ['territories-list'],
      revalidate: false
    }
  )();
};

/**
 * Get gangs available for territory assignment with persistent caching
 * Used by territory gang modal
 */
export const getCampaignGangsForModal = async (campaignId: string) => {
  const supabase = await createClient();
  return unstable_cache(
    async () => {
      // Get campaign gangs
      const { data: campaignGangs, error: campaignGangsError } = await supabase
        .from('campaign_gangs')
        .select(`
          id,
          gang_id,
          user_id,
          campaign_member_id
        `)
        .eq('campaign_id', campaignId);

      if (campaignGangsError) throw campaignGangsError;

      const gangIds = campaignGangs?.map(cg => cg.gang_id) || [];
      let gangsData: any[] = [];

      if (gangIds.length > 0) {
        const { data: gangs, error: gangsError } = await supabase
          .from('gangs')
          .select(`
            id,
            name,
            gang_type,
            gang_colour
          `)
          .in('id', gangIds);

        if (gangsError) throw gangsError;
        gangsData = gangs || [];
      }

      // Combine campaign gangs with gang details
      const availableGangs = campaignGangs?.map(cg => {
        const gangDetails = gangsData.find(g => g.id === cg.gang_id);
        return {
          id: cg.id,
          gang_id: cg.gang_id,
          gang_name: gangDetails?.name || 'Unknown',
          gang_type: gangDetails?.gang_type || '',
          gang_colour: gangDetails?.gang_colour || '#000000',
          user_id: cg.user_id,
          campaign_member_id: cg.campaign_member_id
        };
      }) || [];

      return availableGangs;
    },
    [`campaign-gangs-modal-${campaignId}`],
    {
      tags: ['campaign-gangs', `campaign-gangs-${campaignId}`, `campaign-${campaignId}`],
      revalidate: false
    }
  )();
};