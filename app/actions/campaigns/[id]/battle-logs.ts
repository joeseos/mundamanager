'use server';

// Battle log API operations
import { createClient } from "@/utils/supabase/server";
import { cache } from 'react';
import { logBattleResult, logTerritoryClaimed } from "../../logs/gang-campaign-logs";
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Type definition for battle participant
 */
export interface BattleParticipant {
  role: 'attacker' | 'defender' | 'none';
  gang_id: string;
}

/**
 * Type definition for territory claim
 */
export interface TerritoryClaimRequest {
  campaign_territory_id: string;
}

/**
 * Interface for battle log creation/update parameters
 */
export interface BattleLogParams {
  scenario: string;
  attacker_id: string;
  defender_id: string;
  winner_id: string | null;
  note: string | null;
  participants: BattleParticipant[];
  claimed_territories?: TerritoryClaimRequest[];
  created_at?: string;
  territory_id?: string | null;
  custom_territory_id?: string | null;
  cycle?: number | null;
}

/**
 * Helper function to log battle results for all participants
 * Reduces code duplication and fixes N+1 query problem
 */
async function logBattleParticipantResults(
  supabase: SupabaseClient,
  participants: BattleParticipant[] | string,
  winner_id: string | null,
  scenario: string,
  campaign: { campaign_name: string },
  claimed_territories: TerritoryClaimRequest[],
  winner: { name: string } | null
) {
  try {
    // Parse participants if it's a JSON string
    const parsedParticipants = typeof participants === 'string'
      ? JSON.parse(participants)
      : participants;

    if (!Array.isArray(parsedParticipants) || parsedParticipants.length === 0) {
      return;
    }

    // Batch fetch all gang names upfront to avoid N+1 queries
    const allGangIds = parsedParticipants.map(p => p.gang_id).filter(Boolean);
    const { data: allGangs } = await supabase
      .from('gangs')
      .select('id, name')
      .in('id', allGangIds);

    const gangNameMap = new Map(allGangs?.map((g: any) => [g.id, g.name]) || []);

    // Log results for each participant
    for (const participant of parsedParticipants) {
      if (!participant.gang_id) continue;

      const gangName = gangNameMap.get(participant.gang_id);
      if (!gangName) continue;

      // Determine result for this gang
      let result: 'won' | 'lost' | 'draw';
      if (winner_id === null) {
        result = 'draw';
      } else if (winner_id === participant.gang_id) {
        result = 'won';
      } else {
        result = 'lost';
      }

      // Get all other gang names in the battle (already fetched)
      const otherParticipants = parsedParticipants.filter((p: BattleParticipant) => p.gang_id !== participant.gang_id);
      const opponentNames = otherParticipants
        .map((p: BattleParticipant) => gangNameMap.get(p.gang_id))
        .filter((name): name is string => Boolean(name));
      const opponentName = opponentNames.join(', ') || 'Unknown';

      await logBattleResult({
        gang_id: participant.gang_id,
        gang_name: gangName as string,
        campaign_name: campaign.campaign_name,
        opponent_name: opponentName,
        scenario,
        result,
        is_attacker: participant.role === 'attacker' ? true : participant.role === 'defender' ? false : undefined
      });
    }

    // Log territory claims if any
    if (claimed_territories.length > 0 && winner_id && winner) {
      for (const territory of claimed_territories) {
        // Get territory data directly from campaign_territories table
        const { data: territoryData } = await supabase
          .from('campaign_territories')
          .select('territory_name, custom_territory_id')
          .eq('id', territory.campaign_territory_id)
          .single();

        const territoryName = territoryData?.territory_name;
        const isCustom = !!territoryData?.custom_territory_id;

        if (territoryName) {
          await logTerritoryClaimed({
            gang_id: winner_id,
            gang_name: winner.name,
            territory_name: territoryName,
            campaign_name: campaign.campaign_name,
            is_custom: isCustom
          });
        }
      }
    }
  } catch (logError) {
    console.error('Error logging battle results:', logError);
    // Don't fail the main operation if logging fails
  }
}

/**
 * Create a new battle log using direct Supabase client
 */
export async function createBattleLog(campaignId: string, params: BattleLogParams): Promise<any> {
  try {
    const supabase = await createClient();

    const {
      scenario,
      attacker_id,
      defender_id,
      winner_id,
      note,
      participants,
      claimed_territories = [],
      created_at,
      cycle
    } = params;

    // Get territory IDs if a territory is being claimed
    let territory_id: string | null = null;
    let custom_territory_id: string | null = null;

    if (claimed_territories.length > 0) {
      const { data: territoryData } = await supabase
        .from('campaign_territories')
        .select('territory_id, custom_territory_id')
        .eq('id', claimed_territories[0].campaign_territory_id)
        .single();

      if (territoryData) {
        territory_id = territoryData.territory_id;
        custom_territory_id = territoryData.custom_territory_id;
      }
    }

    // First, create the battle record
    const { data: battle, error: battleError } = await supabase
      .from('campaign_battles')
      .insert([
        {
          campaign_id: campaignId,
          scenario,
          attacker_id,
          defender_id,
          winner_id,
          note,
          participants: Array.isArray(participants) ? JSON.stringify(participants) : participants,
          created_at: created_at ?? new Date().toISOString(),
          territory_id,
          custom_territory_id,
          cycle
        }
      ])
      .select()
      .single();

    if (battleError) throw battleError;

    // Process territory claims if any
    if (claimed_territories.length > 0 && winner_id) {
      for (const territory of claimed_territories) {
        const { error } = await supabase
          .from('campaign_territories')
          .update({ gang_id: winner_id })
          .eq('id', territory.campaign_territory_id)
          .eq('campaign_id', campaignId);

        if (error) {
          console.error('Territory update failed:', error);
        }
      }
    }

    // Then fetch the related data for display and logging
    const [
      { data: attacker },
      { data: defender },
      { data: winner },
      { data: campaign }
    ] = await Promise.all([
      supabase.from('gangs').select('name').eq('id', attacker_id).maybeSingle(),
      supabase.from('gangs').select('name').eq('id', defender_id).maybeSingle(),
      winner_id ? supabase.from('gangs').select('name').eq('id', winner_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('campaigns').select('campaign_name').eq('id', campaignId).maybeSingle()
    ]);

    // Log battle results for all participating gangs
    if (campaign) {
      await logBattleParticipantResults(
        supabase,
        participants,
        winner_id,
        scenario,
        campaign,
        claimed_territories,
        winner
      );
    }

    // Transform the response to match the expected format
    const transformedBattle = {
      ...battle,
      cycle: battle.cycle,
      attacker: attacker?.name ? { id: attacker_id, name: attacker.name } : undefined,
      defender: defender?.name ? { id: defender_id, name: defender.name } : undefined,
      winner: winner?.name ? { id: winner_id, name: winner.name } : undefined
    };

    // 🎯 Invalidate cache - battles and territories if claimed
    const { revalidateTag } = await import('next/cache');
    revalidateTag('campaign-battles');
    if (claimed_territories.length > 0) {
      revalidateTag(`campaign-territories-${campaignId}`);
      revalidateTag(`campaign-${campaignId}`);
    }

    return transformedBattle;
  } catch (error) {
    console.error('Error creating battle log:', error);
    throw error;
  }
}

/**
 * Update an existing battle log using direct Supabase client
 */
export async function updateBattleLog(campaignId: string, battleId: string, params: BattleLogParams): Promise<any> {
  try {
    const supabase = await createClient();

    const {
      scenario,
      attacker_id,
      defender_id,
      winner_id,
      note,
      participants,
      claimed_territories = [],
      created_at,
      cycle
    } = params;

    // First, verify the battle exists and belongs to the campaign
    const { data: existingBattle, error: checkError } = await supabase
      .from('campaign_battles')
      .select('id')
      .eq('id', battleId)
      .eq('campaign_id', campaignId)
      .single();

    if (checkError || !existingBattle) {
      throw new Error('Battle not found or access denied');
    }

    // Get territory IDs if a territory is being claimed
    let territory_id: string | null = null;
    let custom_territory_id: string | null = null;

    if (claimed_territories.length > 0) {
      const { data: territoryData } = await supabase
        .from('campaign_territories')
        .select('territory_id, custom_territory_id')
        .eq('id', claimed_territories[0].campaign_territory_id)
        .single();

      if (territoryData) {
        territory_id = territoryData.territory_id;
        custom_territory_id = territoryData.custom_territory_id;
      }
    }

    // Build update payload conditionally including created_at if provided
    const updatePayload: any = {
      scenario,
      attacker_id,
      defender_id,
      winner_id,
      note,
      participants: Array.isArray(participants) ? JSON.stringify(participants) : participants,
      updated_at: new Date().toISOString(),
      territory_id,
      custom_territory_id,
      cycle
    };
    if (created_at) {
      updatePayload.created_at = created_at;
    }

    // Update the battle record
    const { data: battle, error: battleError } = await supabase
      .from('campaign_battles')
      .update(updatePayload)
      .eq('id', battleId)
      .select()
      .single();

    if (battleError) throw battleError;

    // Process territory claims if any
    if (claimed_territories.length > 0 && winner_id) {
      for (const territory of claimed_territories) {
        await supabase
          .from('campaign_territories')
          .update({ gang_id: winner_id })
          .eq('id', territory.campaign_territory_id)
          .eq('campaign_id', campaignId);
      }
    }

    // Then fetch the related data for display and logging
    const [
      { data: attacker },
      { data: defender },
      { data: winner },
      { data: campaign }
    ] = await Promise.all([
      supabase.from('gangs').select('name').eq('id', attacker_id).maybeSingle(),
      supabase.from('gangs').select('name').eq('id', defender_id).maybeSingle(),
      winner_id ? supabase.from('gangs').select('name').eq('id', winner_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('campaigns').select('campaign_name').eq('id', campaignId).maybeSingle()
    ]);

    // Log battle results for all participating gangs
    if (campaign) {
      await logBattleParticipantResults(
        supabase,
        participants,
        winner_id,
        scenario,
        campaign,
        claimed_territories,
        winner
      );
    }

    // Transform the response to match the expected format
    const transformedBattle = {
      ...battle,
      cycle: battle.cycle,
      attacker: attacker?.name ? { id: attacker_id, name: attacker.name } : undefined,
      defender: defender?.name ? { id: defender_id, name: defender.name } : undefined,
      winner: winner?.name ? { id: winner_id, name: winner.name } : undefined
    };

    // 🎯 Invalidate cache - battles and territories if claimed
    const { revalidateTag } = await import('next/cache');
    revalidateTag('campaign-battles');
    if (claimed_territories.length > 0) {
      revalidateTag(`campaign-territories-${campaignId}`);
      revalidateTag(`campaign-${campaignId}`);
    }

    return transformedBattle;
  } catch (error) {
    console.error('Error updating battle log:', error);
    throw error;
  }
}

/**
 * Delete a battle log using direct Supabase client
 */
export async function deleteBattleLog(campaignId: string, battleId: string): Promise<void> {
  'use server';

  try {
    const supabase = await createClient();

    // First, verify the battle exists and belongs to the campaign
    const { data: existingBattle, error: checkError } = await supabase
      .from('campaign_battles')
      .select('id')
      .eq('id', battleId)
      .eq('campaign_id', campaignId)
      .single();

    if (checkError || !existingBattle) {
      console.error('Battle not found or access denied', checkError);
      throw new Error('Battle not found or access denied');
    }

    // Delete the battle
    const { error: deleteError } = await supabase
      .from('campaign_battles')
      .delete()
      .eq('id', battleId);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      throw deleteError;
    }

    // Invalidate battles cache
    const { revalidateTag } = await import('next/cache');
    revalidateTag('campaign-battles');
  } catch (error) {
    console.error('Error deleting battle log:', error);
    throw error;
  }
}

/**
 * Get battle data including scenarios using direct Supabase client
 */
export const getBattleData = cache(async function fetchBattleData(campaignId: string): Promise<any> {
  try {
    const supabase = await createClient();

    // Get scenarios
    const { data: scenarios, error: scenariosError } = await supabase
      .from('scenarios')
      .select('id, scenario_name, scenario_number');

    if (scenariosError) throw scenariosError;

    // Get gangs in the campaign with their names
    const { data: campaignGangs, error: gangsError } = await supabase
      .from('campaign_gangs')
      .select(`gang_id, gangs:gang_id ( id, name )`)
      .eq('campaign_id', campaignId);

    if (gangsError) throw gangsError;

    // Transform the data for easier consumption
    const gangs = campaignGangs
      .filter(cg => cg.gangs && cg.gangs.length > 0) // Ensure gangs array is not empty
      .map(cg => ({
        id: cg.gang_id,
        name: cg.gangs[0].name // Access the first gang's name
      }));

    return {
      scenarios,
      gangs
    };
  } catch (error) {
    console.error('Error loading battle data:', error);
    throw error;
  }
}); 