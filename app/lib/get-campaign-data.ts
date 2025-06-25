import { createClient } from "@/utils/supabase/server";
import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';

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
  campaign_types: {
    campaign_type_name: string;
  } | null;
}

interface Fighter {
  id: string;
  gang_id: string;
  credits: number;
  cost_adjustment: number;
  fighter_equipment?: { purchase_cost: number }[];
  fighter_characteristics?: { credits_increase: number }[];
  fighter_skills?: { credits_increase: number }[];
  fighter_effects?: { type_specific_data: { credits_increase?: number } }[];
  vehicles?: {
    id: string;
    cost: number;
    fighter_equipment?: { purchase_cost: number }[];
  }[];
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

// Internal cached functions
const _getCampaignBasic = unstable_cache(
  async (campaignId: string, supabase: SupabaseClient) => {
    // Get campaign basic info
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
        has_scavenging_rolls
      `)
      .eq('id', campaignId)
      .single();

    if (campaignError) throw campaignError;

    // Get campaign type separately
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

    // Combine the data
    return {
      ...campaign,
      campaign_types: campaignTypeName ? { campaign_type_name: campaignTypeName } : null
    };
  },
  ['campaign-basic'],
  {
    revalidate: 3600, // 1 hour
  }
);

const _getCampaignMembers = unstable_cache(
  async (campaignId: string, supabase: SupabaseClient) => {
    // Get campaign members
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

    // Get profile details separately
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

    // Get campaign gangs for this campaign
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

    // Get gang details separately to avoid join issues
    const gangIds = campaignGangs?.map(cg => cg.gang_id) || [];
    let gangsData: any[] = [];
    
    if (gangIds.length > 0) {
      const { data: gangs, error: gangsDetailError } = await supabase
        .from('gangs')
        .select(`
          id,
          name,
          gang_type_id,
          gang_colour,
          reputation
        `)
        .in('id', gangIds);

      if (gangsDetailError) throw gangsDetailError;
      gangsData = gangs || [];

      // Get gang types separately
      const gangTypeIds = gangsData.map(g => g.gang_type_id).filter(Boolean);
      let gangTypesData: any[] = [];
      
      if (gangTypeIds.length > 0) {
        const { data: gangTypes, error: gangTypesError } = await supabase
          .from('gang_types')
          .select('id, gang_type')
          .in('id', gangTypeIds);

        if (!gangTypesError && gangTypes) {
          gangTypesData = gangTypes;
        }
      }

      // Combine gang data with types
      gangsData = gangsData.map(gang => ({
        ...gang,
        gang_type: gangTypesData.find(gt => gt.id === gang.gang_type_id)?.gang_type || ''
      }));
    }

    // Get comprehensive fighter data for gang ratings (matching production calculation)
    let fightersData: any[] = [];
    
    if (gangIds.length > 0) {
      const { data: fighters, error: fightersError } = await supabase
        .from('fighters')
        .select(`
          id,
          gang_id,
          credits,
          cost_adjustment,
          fighter_equipment(purchase_cost),
          fighter_characteristics(credits_increase),
          fighter_skills(credits_increase),
          fighter_effects(type_specific_data),
          vehicles(id, cost, fighter_equipment(purchase_cost))
        `)
        .in('gang_id', gangIds)
        .eq('killed', false)
        .eq('retired', false)
        .eq('enslaved', false);

      if (fightersError) throw fightersError;
      fightersData = fighters || [];
    }

    // Calculate gang ratings using comprehensive calculation (matching production)
    const gangRatings = new Map<string, number>();
    gangIds.forEach(gangId => {
      const gangFighters = fightersData.filter(f => f.gang_id === gangId);
      const rating = gangFighters.reduce((sum, fighter) => {
        let fighterRating = (fighter.credits || 0) + (fighter.cost_adjustment || 0);
        
        // Add equipment costs
        if (fighter.fighter_equipment) {
          fighterRating += fighter.fighter_equipment.reduce((equipSum: number, eq: { purchase_cost: number }) => 
            equipSum + (eq.purchase_cost || 0), 0);
        }
        
        // Add characteristics costs
        if (fighter.fighter_characteristics) {
          fighterRating += fighter.fighter_characteristics.reduce((charSum: number, char: { credits_increase: number }) => 
            charSum + (char.credits_increase || 0), 0);
        }
        
        // Add skills costs
        if (fighter.fighter_skills) {
          fighterRating += fighter.fighter_skills.reduce((skillSum: number, skill: { credits_increase: number }) => 
            skillSum + (skill.credits_increase || 0), 0);
        }
        
        // Add effects costs
        if (fighter.fighter_effects) {
          fighterRating += fighter.fighter_effects.reduce((effectSum: number, effect: { type_specific_data: { credits_increase?: number } }) => {
            const creditsIncrease = effect.type_specific_data?.credits_increase;
            return effectSum + (typeof creditsIncrease === 'number' ? creditsIncrease : 0);
          }, 0);
        }
        
        // Add vehicle costs
        if (fighter.vehicles) {
          fighter.vehicles.forEach((vehicle: any) => {
            fighterRating += (vehicle.cost || 0);
            if (vehicle.fighter_equipment) {
              fighterRating += vehicle.fighter_equipment.reduce((vehEqSum: number, eq: { purchase_cost: number }) => 
                vehEqSum + (eq.purchase_cost || 0), 0);
            }
          });
        }
        
        return sum + fighterRating;
      }, 0);
      gangRatings.set(gangId, rating);
    });

    // Combine members with their gangs and profiles
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
          campaign_member_id: cg.campaign_member_id
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
  },
  ['campaign-members', 'campaign-gangs'],
  {
    revalidate: 300, // 5 minutes
  }
);

const _getCampaignTerritories = unstable_cache(
  async (campaignId: string, supabase: SupabaseClient) => {
    const { data: territories, error } = await supabase
      .from('campaign_territories')
      .select(`
        id,
        territory_id,
        territory_name,
        gang_id,
        created_at
      `)
      .eq('campaign_id', campaignId);

    if (error) throw error;

    // Get gang details separately
    const territoryGangIds = territories?.map(t => t.gang_id).filter(Boolean) || [];
    let territoryGangsData: any[] = [];
    
    if (territoryGangIds.length > 0) {
      const { data: gangs, error: gangsError } = await supabase
        .from('gangs')
        .select(`
          id,
          name,
          gang_type_id,
          gang_colour
        `)
        .in('id', territoryGangIds);

      if (!gangsError && gangs) {
        territoryGangsData = gangs;

        // Get gang types for territories
        const territoryGangTypeIds = gangs.map(g => g.gang_type_id).filter(Boolean);
        if (territoryGangTypeIds.length > 0) {
          const { data: gangTypes, error: gangTypesError } = await supabase
            .from('gang_types')
            .select('id, gang_type')
            .in('id', territoryGangTypeIds);

          if (!gangTypesError && gangTypes) {
            territoryGangsData = territoryGangsData.map(gang => ({
              ...gang,
              gang_type: gangTypes.find(gt => gt.id === gang.gang_type_id)?.gang_type || ''
            }));
          }
        }
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
        owning_gangs: gangDetails ? [{
          id: gangDetails.id,
          name: gangDetails.name,
          gang_type: gangDetails.gang_type || '',
          gang_colour: gangDetails.gang_colour || '#000000'
        }] : []
      };
    }) || [];
  },
  ['campaign-territories', 'campaign-gangs'],
  {
    revalidate: 600, // 10 minutes
  }
);

const _getCampaignBattles = unstable_cache(
  async (campaignId: string, supabase: SupabaseClient, limit = 50) => {
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

    // Get scenario details separately
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

    // Get gang details for battles
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
  },
  ['campaign-battles', 'campaign-gangs'],
  {
    revalidate: 60, // 1 minute
  }
);

// Public API functions that create Supabase client and call cached functions
export async function getCampaignBasic(campaignId: string) {
  const supabase = await createClient();
  return _getCampaignBasic(campaignId, supabase);
}

export async function getCampaignMembers(campaignId: string) {
  const supabase = await createClient();
  return _getCampaignMembers(campaignId, supabase);
}

export async function getCampaignTerritories(campaignId: string) {
  const supabase = await createClient();
  return _getCampaignTerritories(campaignId, supabase);
}

export async function getCampaignBattles(campaignId: string, limit = 50) {
  const supabase = await createClient();
  return _getCampaignBattles(campaignId, supabase, limit);
}

// Helper function to create cache tags dynamically
export function createCacheTag(campaignId: string, type: 'basic' | 'members' | 'territories' | 'battles'): string {
  return `campaign:${campaignId}:${type}`;
}

export function createCampaignCacheTag(campaignId: string): string {
  return `campaign:${campaignId}`;
} 