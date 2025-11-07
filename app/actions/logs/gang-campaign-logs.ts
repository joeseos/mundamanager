'use server'

import { createClient } from "@/utils/supabase/server";
import { createGangLog, GangLogActionResult } from "./gang-logs";

// Campaign-specific logging functions

interface GangJoinedCampaignLogParams {
  gang_id: string;
  gang_name: string;
  campaign_name: string;
  user_name: string;
}

interface GangLeftCampaignLogParams {
  gang_id: string;
  gang_name: string;
  campaign_name: string;
  user_name: string;
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

export async function logGangJoinedCampaign(params: GangJoinedCampaignLogParams): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();
    
    // Get the gang owner's user_id to satisfy RLS policy
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
    
    const description = `Gang joined campaign "${params.campaign_name}" (added by ${params.user_name})`;
    return await createGangLog({
      gang_id: params.gang_id,
      user_id: gangData.user_id, // Use gang owner's user_id to satisfy RLS policy
      action_type: 'campaign_joined',
      description
    });
} catch (error) {
    console.error('Error logging gang campaign join:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to log campaign join'
    };
  }
}

export async function logGangLeftCampaign(params: GangLeftCampaignLogParams): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();
    
    // Get the gang owner's user_id to satisfy RLS policy
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
    
    const description = `Gang left campaign "${params.campaign_name}" (removed by ${params.user_name})`;

    return await createGangLog({
      gang_id: params.gang_id,
      user_id: gangData.user_id, // Use gang owner's user_id to satisfy RLS policy
      action_type: 'campaign_left',
      description
    });
  } catch (error) {
    console.error('Error logging gang campaign leave:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to log campaign leave'
    };
  }
}

export async function logBattleResult(params: BattleResultLogParams): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();
    
    // Get the gang owner's user_id to satisfy RLS policy
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
      user_id: gangData.user_id, // Use gang owner's user_id to satisfy RLS policy
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
    
    // Get the gang owner's user_id to satisfy RLS policy
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
      user_id: gangData.user_id, // Use gang owner's user_id to satisfy RLS policy
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
    
    // Get the gang owner's user_id to satisfy RLS policy
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
      user_id: gangData.user_id, // Use gang owner's user_id to satisfy RLS policy
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