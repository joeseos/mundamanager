'use server';

// Battle log API operations
import { createClient } from "@/utils/supabase/server";
import { cache } from 'react';

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
  territory_id: string;
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
      claimed_territories = [] 
    } = params;

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
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (battleError) throw battleError;

    // Process territory claims if any
    if (claimed_territories.length > 0 && winner_id) {
      for (const territory of claimed_territories) {
        await supabase
          .from('campaign_territories')
          .update({ controlled_by: winner_id })
          .eq('territory_id', territory.territory_id)
          .eq('campaign_id', campaignId);
      }
    }

    // Then fetch the related data for display
    const [
      { data: attacker },
      { data: defender },
      { data: winner }
    ] = await Promise.all([
      supabase.from('gangs').select('name').eq('id', attacker_id).single(),
      supabase.from('gangs').select('name').eq('id', defender_id).single(),
      winner_id ? supabase.from('gangs').select('name').eq('id', winner_id).single() : Promise.resolve({ data: null })
    ]);

    // Transform the response to match the expected format
    const transformedBattle = {
      ...battle,
      attacker: { gang_name: attacker?.name },
      defender: { gang_name: defender?.name },
      winner: winner?.name ? { gang_name: winner.name } : null
    };

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
      claimed_territories = [] 
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

    // Update the battle record
    const { data: battle, error: battleError } = await supabase
      .from('campaign_battles')
      .update({
        scenario,
        attacker_id,
        defender_id,
        winner_id,
        note,
        participants: Array.isArray(participants) ? JSON.stringify(participants) : participants,
        updated_at: new Date().toISOString()
      })
      .eq('id', battleId)
      .select()
      .single();

    if (battleError) throw battleError;

    // Process territory claims if any
    if (claimed_territories.length > 0 && winner_id) {
      for (const territory of claimed_territories) {
        await supabase
          .from('campaign_territories')
          .update({ controlled_by: winner_id })
          .eq('territory_id', territory.territory_id)
          .eq('campaign_id', campaignId);
      }
    }

    // Then fetch the related data for display
    const [
      { data: attacker },
      { data: defender },
      { data: winner }
    ] = await Promise.all([
      supabase.from('gangs').select('name').eq('id', attacker_id).single(),
      supabase.from('gangs').select('name').eq('id', defender_id).single(),
      winner_id ? supabase.from('gangs').select('name').eq('id', winner_id).single() : Promise.resolve({ data: null })
    ]);

    // Transform the response to match the expected format
    const transformedBattle = {
      ...battle,
      attacker: { gang_name: attacker?.name },
      defender: { gang_name: defender?.name },
      winner: winner?.name ? { gang_name: winner.name } : null
    };

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
  
  console.log(`Server: Deleting battle log ${battleId} for campaign ${campaignId}`);
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
    console.log(`Server: Found battle ${battleId}, deleting...`);
    const { error: deleteError } = await supabase
      .from('campaign_battles')
      .delete()
      .eq('id', battleId);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      throw deleteError;
    }
    
    console.log(`Server: Successfully deleted battle ${battleId}`);
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