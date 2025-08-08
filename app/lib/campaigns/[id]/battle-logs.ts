'use server';

// Battle log API operations
import { createClient } from "@/utils/supabase/server";
import { cache } from 'react';
import { logBattleResult, logTerritoryClaimed } from "../../../actions/logs/gang-campaign-logs";

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
  territory_id?: string;
  custom_territory_id?: string;
  is_custom?: boolean;
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
      created_at
    } = params;

    console.log('🆕 Creating battle log with params:', { 
      campaignId, 
      claimed_territories,
      winner_id 
    });

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
          created_at: created_at ?? new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (battleError) throw battleError;

    // Process territory claims if any
    if (claimed_territories.length > 0 && winner_id) {
      console.log('🏆 Processing territory claims:', { 
        claimed_territories, 
        winner_id, 
        campaignId 
      });
      
      for (const territory of claimed_territories) {
        console.log('🎯 Processing territory claim:', territory);
        
        let updateQuery = supabase
          .from('campaign_territories')
          .update({ gang_id: winner_id })
          .eq('campaign_id', campaignId);

        if (territory.is_custom && territory.custom_territory_id) {
          console.log('🎨 Updating custom territory:', territory.custom_territory_id);
          updateQuery = updateQuery.eq('custom_territory_id', territory.custom_territory_id);
        } else if (territory.territory_id) {
          console.log('🏛️ Updating regular territory:', territory.territory_id);
          updateQuery = updateQuery.eq('territory_id', territory.territory_id);
        }

        const { data, error } = await updateQuery;
        console.log('📊 Territory update result:', { data, error });
        
        if (error) {
          console.error('❌ Territory update failed:', error);
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
      supabase.from('gangs').select('name').eq('id', attacker_id).single(),
      supabase.from('gangs').select('name').eq('id', defender_id).single(),
      winner_id ? supabase.from('gangs').select('name').eq('id', winner_id).single() : Promise.resolve({ data: null }),
      supabase.from('campaigns').select('campaign_name').eq('id', campaignId).single()
    ]);

    console.log('Battle participants:', { attacker, defender, winner, campaign });

    // Log battle results for both gangs
    if (attacker && defender && campaign) {
      try {
        console.log('Logging battle results...');
        
        // Log for attacker
        const attackerResult = winner_id === attacker_id ? 'won' : (winner_id === defender_id ? 'lost' : 'draw');
        const attackerLog = await logBattleResult({
          gang_id: attacker_id,
          gang_name: attacker.name,
          campaign_name: campaign.campaign_name,
          opponent_name: defender.name,
          scenario,
          result: attackerResult,
          is_attacker: true
        });
        console.log('Attacker log result:', attackerLog);

        // Log for defender
        const defenderResult = winner_id === defender_id ? 'won' : (winner_id === attacker_id ? 'lost' : 'draw');
        const defenderLog = await logBattleResult({
          gang_id: defender_id,
          gang_name: defender.name,
          campaign_name: campaign.campaign_name,
          opponent_name: attacker.name,
          scenario,
          result: defenderResult,
          is_attacker: false
        });
        console.log('Defender log result:', defenderLog);

        // 🎯 Log territory claims if any
        if (claimed_territories.length > 0 && winner_id && winner) {
          console.log('Logging territory claims...');
          for (const territory of claimed_territories) {
            // Get territory name
            let territoryName = '';
            if (territory.is_custom && territory.custom_territory_id) {
              const { data: customTerritory } = await supabase
                .from('custom_territories')
                .select('name')
                .eq('id', territory.custom_territory_id)
                .single();
              territoryName = customTerritory?.name || 'Unknown Custom Territory';
            } else if (territory.territory_id) {
              const { data: regularTerritory } = await supabase
                .from('territories')
                .select('name')
                .eq('id', territory.territory_id)
                .single();
              territoryName = regularTerritory?.name || 'Unknown Territory';
            }

            if (territoryName) {
              const territoryLog = await logTerritoryClaimed({
                gang_id: winner_id,
                gang_name: winner.name,
                territory_name: territoryName,
                campaign_name: campaign.campaign_name,
                is_custom: territory.is_custom
              });
              console.log('Territory claim log result:', territoryLog);
            }
          }
        }
      } catch (logError) {
        console.error('Error logging battle results:', logError);
        // Don't fail the main operation if logging fails
      }
    } else {
      console.log('Missing data for logging:', { attacker, defender, campaign });
    }

    // Transform the response to match the expected format
    const transformedBattle = {
      ...battle,
      attacker: { gang_name: attacker?.name },
      defender: { gang_name: defender?.name },
      winner: winner?.name ? { gang_name: winner.name } : null
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
      created_at
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

    // Build update payload conditionally including created_at if provided
    const updatePayload: any = {
      scenario,
      attacker_id,
      defender_id,
      winner_id,
      note,
      participants: Array.isArray(participants) ? JSON.stringify(participants) : participants,
      updated_at: new Date().toISOString()
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
        let updateQuery = supabase
          .from('campaign_territories')
          .update({ gang_id: winner_id })
          .eq('campaign_id', campaignId);

        if (territory.is_custom && territory.custom_territory_id) {
          updateQuery = updateQuery.eq('custom_territory_id', territory.custom_territory_id);
        } else if (territory.territory_id) {
          updateQuery = updateQuery.eq('territory_id', territory.territory_id);
        }

        await updateQuery;
      }
    }

    // Then fetch the related data for display and logging
    const [
      { data: attacker },
      { data: defender },
      { data: winner },
      { data: campaign }
    ] = await Promise.all([
      supabase.from('gangs').select('name').eq('id', attacker_id).single(),
      supabase.from('gangs').select('name').eq('id', defender_id).single(),
      winner_id ? supabase.from('gangs').select('name').eq('id', winner_id).single() : Promise.resolve({ data: null }),
      supabase.from('campaigns').select('campaign_name').eq('id', campaignId).single()
    ]);
    console.log('attacker', attacker);
    console.log('defender', defender);
    console.log('winner', winner);
    console.log('campaign', campaign);

    // 🎯 Log battle results for both gangs
    if (attacker && defender && campaign) {
      try {
        // Log for attacker
        const attackerResult = winner_id === attacker_id ? 'won' : (winner_id === defender_id ? 'lost' : 'draw');
        await logBattleResult({
          gang_id: attacker_id,
          gang_name: attacker.name,
          campaign_name: campaign.campaign_name,
          opponent_name: defender.name,
          scenario,
          result: attackerResult,
          is_attacker: true
        });

        // Log for defender
        const defenderResult = winner_id === defender_id ? 'won' : (winner_id === attacker_id ? 'lost' : 'draw');
        const testing = await logBattleResult({
          gang_id: defender_id,
          gang_name: defender.name,
          campaign_name: campaign.campaign_name,
          opponent_name: attacker.name,
          scenario,
          result: defenderResult,
          is_attacker: false
        });
        console.log('testing', testing);
        // 🎯 Log territory claims if any
        if (claimed_territories.length > 0 && winner_id && winner) {
          for (const territory of claimed_territories) {
            // Get territory name
            let territoryName = '';
            if (territory.is_custom && territory.custom_territory_id) {
              const { data: customTerritory } = await supabase
                .from('custom_territories')
                .select('name')
                .eq('id', territory.custom_territory_id)
                .single();
              territoryName = customTerritory?.name || 'Unknown Custom Territory';
            } else if (territory.territory_id) {
              const { data: regularTerritory } = await supabase
                .from('territories')
                .select('name')
                .eq('id', territory.territory_id)
                .single();
              territoryName = regularTerritory?.name || 'Unknown Territory';
            }

            if (territoryName) {
              await logTerritoryClaimed({
                gang_id: winner_id,
                gang_name: winner.name,
                territory_name: territoryName,
                campaign_name: campaign.campaign_name,
                is_custom: territory.is_custom
              });
            }
          }
        }
      } catch (logError) {
        console.error('Error logging battle results:', logError);
        // Don't fail the main operation if logging fails
      }
    }

    // Transform the response to match the expected format
    const transformedBattle = {
      ...battle,
      attacker: { gang_name: attacker?.name },
      defender: { gang_name: defender?.name },
      winner: winner?.name ? { gang_name: winner.name } : null
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
    
    // 🎯 Invalidate battles cache
    const { revalidateTag } = await import('next/cache');
    revalidateTag('campaign-battles');

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