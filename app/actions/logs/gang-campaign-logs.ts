'use server'

import { createClient } from "@/utils/supabase/server";
import { createGangLog, GangLogActionResult } from "./gang-logs";

// Campaign-specific logging functions

interface CampaignMembershipLogParams {
  gang_id: string;
  campaign_id: string;
  actor_id: string | null;
}

interface BattleResultLogParams {
  gang_id: string;
  gang_name: string;
  campaign_name: string;
  opponent_name: string;
  scenario: string;
  result: 'won' | 'lost' | 'draw';
  is_attacker?: boolean;
}

interface TerritoryClaimedLogParams {
  gang_id: string;
  gang_name: string;
  territory_name: string;
  campaign_name: string;
  is_custom?: boolean;
}

interface TerritoryLostLogParams {
  gang_id: string;
  gang_name: string;
  territory_name: string;
  campaign_name: string;
  is_custom?: boolean;
}

async function logCampaignMembership(
  params: CampaignMembershipLogParams,
  action_type: 'campaign_joined' | 'campaign_left',
  describe: (campaignName: string, userName: string) => string
): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();

    const [
      { data: gangData, error: gangError },
      { data: campaignData, error: campaignError },
      { data: actorData, error: actorError }
    ] = await Promise.all([
      supabase.from('gangs').select('user_id').eq('id', params.gang_id).single(),
      supabase.from('campaigns').select('campaign_name').eq('id', params.campaign_id).single(),
      params.actor_id
        ? supabase.from('profiles').select('username').eq('id', params.actor_id).maybeSingle()
        : Promise.resolve({ data: null as { username: string | null } | null, error: null })
    ]);

    if (actorError) console.error('Error fetching actor username:', actorError);
    if (gangError || !gangData || campaignError || !campaignData) {
      console.error('Error fetching gang or campaign for log:', gangError ?? campaignError);
      return {
        success: false,
        error: 'Failed to fetch gang or campaign information'
      };
    }

    return await createGangLog({
      gang_id: params.gang_id,
      user_id: gangData.user_id,
      action_type,
      description: describe(campaignData.campaign_name, actorData?.username || 'Unknown User')
    });
  } catch (error) {
    console.error(`Error logging ${action_type}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : `Failed to log ${action_type}`
    };
  }
}

export async function logGangJoinedCampaign(params: CampaignMembershipLogParams): Promise<GangLogActionResult> {
  return logCampaignMembership(params, 'campaign_joined',
    (campaignName, userName) => `Gang joined campaign "${campaignName}" (added by ${userName})`);
}

export async function logGangLeftCampaign(params: CampaignMembershipLogParams): Promise<GangLogActionResult> {
  return logCampaignMembership(params, 'campaign_left',
    (campaignName, userName) => `Gang left campaign "${campaignName}" (removed by ${userName})`);
}

export async function logBattleResult(params: BattleResultLogParams): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();
    
    const { data: gangData, error: gangError } = await supabase
      .from('gangs')
      .select('user_id')
      .eq('id', params.gang_id)
      .single();
    
    if (gangError || !gangData) {
      console.error('Error fetching gang owner:', gangError);
      return {
        success: false,
        error: 'Failed to fetch gang owner information'
      };
    }
    
    let roleText;
    if (params.is_attacker) {
      roleText = 'attacked';
    } else if (params.is_attacker === false) {
      roleText = 'defended against';
    } else {
      roleText = 'fought';
    }

    let resultText;

    switch (params.result) {
      case 'won':
        resultText = 'Victory!';
        break;
      case 'lost':
        resultText = 'Defeat';
        break;
      case 'draw':
        resultText = 'Draw';
        break;
    }

    const description = `Gang "${params.gang_name}" ${roleText} "${params.opponent_name}" in "${params.scenario}" (Campaign: ${params.campaign_name}). Result: ${resultText}`;

    return await createGangLog({
      gang_id: params.gang_id,
      user_id: gangData.user_id,
      action_type: `battle_${params.result}`,
      description
    });
  } catch (error) {
    console.error('Error logging battle result:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to log battle result'
    };
  }
}

export async function logTerritoryClaimed(params: TerritoryClaimedLogParams): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();
    
    const { data: gangData, error: gangError } = await supabase
      .from('gangs')
      .select('user_id')
      .eq('id', params.gang_id)
      .single();
    
    if (gangError || !gangData) {
      console.error('Error fetching gang owner:', gangError);
      return {
        success: false,
        error: 'Failed to fetch gang owner information'
      };
    }
    
    const territoryType = params.is_custom ? 'custom territory' : 'territory';
    const description = `Gang "${params.gang_name}" claimed ${territoryType} "${params.territory_name}" in campaign "${params.campaign_name}"`;

    return await createGangLog({
      gang_id: params.gang_id,
      user_id: gangData.user_id,
      action_type: 'territory_claimed',
      description
    });
  } catch (error) {
    console.error('Error logging territory claim:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to log territory claim'
    };
  }
}

export async function logTerritoryLost(params: TerritoryLostLogParams): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();
    
    const { data: gangData, error: gangError } = await supabase
      .from('gangs')
      .select('user_id')
      .eq('id', params.gang_id)
      .single();
    
    if (gangError || !gangData) {
      console.error('Error fetching gang owner:', gangError);
      return {
        success: false,
        error: 'Failed to fetch gang owner information'
      };
    }
    
    const territoryType = params.is_custom ? 'custom territory' : 'territory';
    const description = `Gang "${params.gang_name}" lost ${territoryType} "${params.territory_name}" in campaign "${params.campaign_name}"`;

    return await createGangLog({
      gang_id: params.gang_id,
      user_id: gangData.user_id,
      action_type: 'territory_lost',
      description
    });
  } catch (error) {
    console.error('Error logging territory loss:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to log territory loss'
    };
  }
}