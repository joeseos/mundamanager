'use server';

// Battle log API operations
import { createClient } from "@/utils/supabase/server";
import { cache } from 'react';
import { logBattleResult, logTerritoryClaimed } from "../../logs/gang-campaign-logs";
import { CACHE_TAGS } from "@/utils/cache-tags";
import type { SupabaseClient } from '@supabase/supabase-js';
import { getWinnerIds, getExplicitClaimerGangId, enrichWinners } from '@/utils/battle-winners';
import { normaliseParticipants, territoryClaimerFor, getAttackerDefenderIds } from '@/utils/battle-participants';

/**
 * Type definition for battle participant.
 * `is_winner` / `claimed_territory` are optional flags supporting multi-winner
 * battles. Defaults to `false` when omitted.
 */
export interface BattleParticipant {
  role: 'attacker' | 'defender' | 'none';
  gang_id: string;
  is_winner?: boolean;
  claimed_territory?: boolean;
}

/**
 * Type definition for territory claim
 */
export interface TerritoryClaimRequest {
  campaign_territory_id: string;
}

/**
 * Interface for battle log creation/update parameters.
 * Multi-winner battles flag every winning participant with `is_winner: true`
 * and (optionally) one with `claimed_territory: true`. Callers that prefer not
 * to manage participant flags directly may pass `winner_id` (single winner) and
 * `territory_claimed_by_gang_id` and the server will normalise the flags.
 */
export interface BattleLogParams {
  scenario: string;
  winner_id: string | null;
  note: string | null;
  participants: BattleParticipant[];
  claimed_territories?: TerritoryClaimRequest[];
  /**
   * Optional explicit territory claimer. If supplied, the server flags the
   * matching participant with `claimed_territory: true`. Required when
   * `participants` contains more than one `is_winner: true` entry and a
   * territory is being claimed.
   */
  territory_claimed_by_gang_id?: string | null;
  created_at?: string;
  cycle?: number | null;
}

/**
 * Helper function to log battle results for all participants.
 * Each gang flagged as a winner is logged as 'won'; non-winners as 'lost'
 * when at least one winner exists, otherwise everyone draws.
 * Reduces code duplication and fixes N+1 query problem.
 */
async function logBattleParticipantResults(
  supabase: SupabaseClient,
  participants: BattleParticipant[],
  effectiveWinnerIds: string[],
  scenario: string,
  campaign: { campaign_name: string },
  claimed_territories: TerritoryClaimRequest[],
  claimerGangId: string | null,
  claimerGangName: string | null
) {
  try {
    if (!Array.isArray(participants) || participants.length === 0) {
      return;
    }

    // Batch fetch all gang names upfront to avoid N+1 queries
    const allGangIds = participants.map((p) => p.gang_id).filter(Boolean);
    const { data: allGangs } = await supabase
      .from('gangs')
      .select('id, name')
      .in('id', allGangIds);

    const gangNameMap = new Map(allGangs?.map((g: any) => [g.id, g.name]) || []);
    const winnerSet = new Set(effectiveWinnerIds);

    // Log results for each participant
    for (const participant of participants) {
      if (!participant.gang_id) continue;

      const gangName = gangNameMap.get(participant.gang_id);
      if (!gangName) continue;

      let result: 'won' | 'lost' | 'draw';
      if (winnerSet.size === 0) {
        result = 'draw';
      } else if (winnerSet.has(participant.gang_id)) {
        result = 'won';
      } else {
        result = 'lost';
      }

      // Get all other gang names in the battle (already fetched)
      const otherParticipants = participants.filter((p) => p.gang_id !== participant.gang_id);
      const opponentNames = otherParticipants
        .map((p) => gangNameMap.get(p.gang_id))
        .filter((name): name is string => Boolean(name));
      const opponentName = opponentNames.join(', ') || 'Unknown';

      await logBattleResult({
        gang_id: participant.gang_id,
        gang_name: gangName as string,
        campaign_name: campaign.campaign_name,
        opponent_name: opponentName,
        scenario,
        result,
        is_attacker:
          participant.role === 'attacker'
            ? true
            : participant.role === 'defender'
              ? false
              : undefined,
      });
    }

    // Log territory claims for the chosen claimer (or sole winner) only
    if (claimed_territories.length > 0 && claimerGangId && claimerGangName) {
      for (const territory of claimed_territories) {
        const { data: territoryData } = await supabase
          .from('campaign_territories')
          .select('territory_name, territory_id')
          .eq('id', territory.campaign_territory_id)
          .single();

        const territoryName = territoryData?.territory_name;
        const isCustom = !territoryData?.territory_id;

        if (territoryName) {
          await logTerritoryClaimed({
            gang_id: claimerGangId,
            gang_name: claimerGangName,
            territory_name: territoryName,
            campaign_name: campaign.campaign_name,
            is_custom: isCustom,
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
      winner_id: callerWinnerId,
      note,
      participants: rawParticipants,
      claimed_territories = [],
      territory_claimed_by_gang_id = null,
      created_at,
      cycle,
    } = params;

    if (claimed_territories.length > 1) {
      throw new Error('Only a single territory claim per battle is supported');
    }

    const newTerritoryId = claimed_territories.length > 0
      ? claimed_territories[0].campaign_territory_id
      : null;

    const { participants, effectiveWinnerIds, claimerGangId } = normaliseParticipants(
      rawParticipants,
      callerWinnerId,
      territoryClaimerFor(newTerritoryId, territory_claimed_by_gang_id, getExplicitClaimerGangId(rawParticipants))
    );

    // Legacy winner_id is populated as the claimer (if any), else the first winner.
    // NULL means a draw.
    const legacyWinnerId: string | null =
      claimerGangId ?? effectiveWinnerIds[0] ?? null;

    // Derive attacker/defender from the (normalised) participants for return enrichment.
    const { attacker_id, defender_id } = getAttackerDefenderIds(participants);

    const { data: battle, error: battleError } = await supabase
      .from('campaign_battles')
      .insert([
        {
          campaign_id: campaignId,
          scenario,
          winner_id: legacyWinnerId,
          note,
          participants: JSON.stringify(participants),
          created_at: created_at ?? new Date().toISOString(),
          campaign_territory_id: newTerritoryId,
          cycle,
        },
      ])
      .select()
      .single();

    if (battleError) throw battleError;

    // Process territory claim for the chosen claimer (if any).
    if (claimed_territories.length > 0 && claimerGangId) {
      for (const territory of claimed_territories) {
        const { error } = await supabase
          .from('campaign_territories')
          .update({ gang_id: claimerGangId })
          .eq('id', territory.campaign_territory_id)
          .eq('campaign_id', campaignId);

        if (error) {
          throw new Error(`Failed to claim territory: ${error.message}`);
        }
      }
    }

    // Fetch gang names needed for return enrichment and activity logging.
    const winnerNameLookupIds = Array.from(new Set(effectiveWinnerIds));
    const [
      { data: attacker },
      { data: defender },
      { data: winnerGangs },
      { data: campaign },
    ] = await Promise.all([
      attacker_id
        ? supabase.from('gangs').select('name').eq('id', attacker_id).maybeSingle()
        : Promise.resolve({ data: null }),
      defender_id
        ? supabase.from('gangs').select('name').eq('id', defender_id).maybeSingle()
        : Promise.resolve({ data: null }),
      winnerNameLookupIds.length > 0
        ? supabase.from('gangs').select('id, name').in('id', winnerNameLookupIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      supabase.from('campaigns').select('campaign_name').eq('id', campaignId).maybeSingle(),
    ]);

    const { winnersEnriched, claimerEnriched, primaryWinner } = enrichWinners(
      winnerGangs as { id: string; name: string }[] | null,
      effectiveWinnerIds,
      claimerGangId,
      legacyWinnerId
    );

    // Log battle results for all participating gangs
    if (campaign) {
      await logBattleParticipantResults(
        supabase,
        participants,
        effectiveWinnerIds,
        scenario,
        campaign,
        claimed_territories,
        claimerGangId,
        claimerEnriched?.name ?? null
      );
    }

    // Transform the response to match the expected format
    const transformedBattle = {
      ...battle,
      cycle: battle.cycle,
      attacker: attacker?.name ? { id: attacker_id, name: attacker.name } : undefined,
      defender: defender?.name ? { id: defender_id, name: defender.name } : undefined,
      winner: primaryWinner ?? undefined,
      winners: winnersEnriched,
      territory_claimer: claimerEnriched,
    };

    // Invalidate cache - battles and territories if claimed
    const { revalidateTag } = await import('next/cache');
    revalidateTag('campaign-battles');
    if (claimed_territories.length > 0 && claimerGangId) {
      revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_TERRITORIES(campaignId));
      revalidateTag(`campaign-${campaignId}`);
    }
    // Invalidate every winner's campaign cache so their stats refresh.
    for (const winnerId of effectiveWinnerIds) {
      revalidateTag(CACHE_TAGS.COMPOSITE_GANG_CAMPAIGNS(winnerId));
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
      winner_id: callerWinnerId,
      note,
      participants: rawParticipants,
      claimed_territories = [],
      territory_claimed_by_gang_id = null,
      created_at,
      cycle,
    } = params;

    if (claimed_territories.length > 1) {
      throw new Error('Only a single territory claim per battle is supported');
    }

    const newTerritoryId = claimed_territories.length > 0
      ? claimed_territories[0].campaign_territory_id
      : null;

    // First, verify the battle exists and belongs to the campaign.
    // Fetch winner_id and participants too so we can invalidate old winners'
    // caches when the winner list changes on an edit.
    const { data: existingBattle, error: checkError } = await supabase
      .from('campaign_battles')
      .select('id, campaign_territory_id, winner_id, participants')
      .eq('id', battleId)
      .eq('campaign_id', campaignId)
      .single();

    if (checkError || !existingBattle) {
      throw new Error('Battle not found or access denied');
    }

    // Derive the old winners so we can bust their caches after the update.
    // Supabase types participants as Json; parseParticipants handles string|array|null at runtime.
    const oldWinnerIds = getWinnerIds(existingBattle as any);

    // Look up the gang currently holding the old territory so we can invalidate their cache.
    // This covers both cases: territory changes (old owner loses it) and same territory with
    // a different winner (old owner is replaced without a release/re-claim cycle).
    let oldTerritoryGangId: string | null = null;
    if (existingBattle.campaign_territory_id) {
      const { data: oldTerritory } = await supabase
        .from('campaign_territories')
        .select('gang_id')
        .eq('id', existingBattle.campaign_territory_id)
        .single();
      oldTerritoryGangId = oldTerritory?.gang_id ?? null;
    }

    const { participants, effectiveWinnerIds, claimerGangId } = normaliseParticipants(
      rawParticipants,
      callerWinnerId,
      territoryClaimerFor(newTerritoryId, territory_claimed_by_gang_id, getExplicitClaimerGangId(rawParticipants))
    );

    const legacyWinnerId: string | null =
      claimerGangId ?? effectiveWinnerIds[0] ?? null;

    // Release old territory if it was removed or changed
    if (
      existingBattle.campaign_territory_id &&
      existingBattle.campaign_territory_id !== newTerritoryId
    ) {
      const { error: releaseError } = await supabase
        .from('campaign_territories')
        .update({ gang_id: null })
        .eq('id', existingBattle.campaign_territory_id)
        .eq('campaign_id', campaignId);

      if (releaseError) {
        throw new Error(`Failed to release old territory: ${releaseError.message}`);
      }
    }

    // Claim new territory for the chosen claimer (if any)
    if (claimed_territories.length > 0 && claimerGangId) {
      for (const territory of claimed_territories) {
        const { error: claimError } = await supabase
          .from('campaign_territories')
          .update({ gang_id: claimerGangId })
          .eq('id', territory.campaign_territory_id)
          .eq('campaign_id', campaignId);

        if (claimError) {
          throw new Error(`Failed to claim territory: ${claimError.message}`);
        }
      }
    }

    // Derive attacker/defender from the normalised participants for return enrichment.
    const { attacker_id, defender_id } = getAttackerDefenderIds(participants);

    // Build update payload conditionally including created_at if provided
    const updatePayload: any = {
      scenario,
      winner_id: legacyWinnerId,
      note,
      participants: JSON.stringify(participants),
      updated_at: new Date().toISOString(),
      campaign_territory_id: newTerritoryId,
      cycle,
    };
    if (created_at) {
      updatePayload.created_at = created_at;
    }

    // Update the battle record last — territory operations are already committed
    const { data: battle, error: battleError } = await supabase
      .from('campaign_battles')
      .update(updatePayload)
      .eq('id', battleId)
      .select()
      .single();

    if (battleError) throw battleError;

    // Fetch gang names needed for return enrichment and activity logging.
    const winnerNameLookupIds = Array.from(new Set(effectiveWinnerIds));
    const [
      { data: attacker },
      { data: defender },
      { data: winnerGangs },
      { data: campaign },
    ] = await Promise.all([
      attacker_id
        ? supabase.from('gangs').select('name').eq('id', attacker_id).maybeSingle()
        : Promise.resolve({ data: null }),
      defender_id
        ? supabase.from('gangs').select('name').eq('id', defender_id).maybeSingle()
        : Promise.resolve({ data: null }),
      winnerNameLookupIds.length > 0
        ? supabase.from('gangs').select('id, name').in('id', winnerNameLookupIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      supabase.from('campaigns').select('campaign_name').eq('id', campaignId).maybeSingle(),
    ]);

    const { winnersEnriched, claimerEnriched, primaryWinner } = enrichWinners(
      winnerGangs as { id: string; name: string }[] | null,
      effectiveWinnerIds,
      claimerGangId,
      legacyWinnerId
    );

    // Log battle results for all participating gangs
    if (campaign) {
      await logBattleParticipantResults(
        supabase,
        participants,
        effectiveWinnerIds,
        scenario,
        campaign,
        claimed_territories,
        claimerGangId,
        claimerEnriched?.name ?? null
      );
    }

    // Transform the response to match the expected format
    const transformedBattle = {
      ...battle,
      cycle: battle.cycle,
      attacker: attacker?.name ? { id: attacker_id, name: attacker.name } : undefined,
      defender: defender?.name ? { id: defender_id, name: defender.name } : undefined,
      winner: primaryWinner ?? undefined,
      winners: winnersEnriched,
      territory_claimer: claimerEnriched,
    };

    // Invalidate cache - battles and territories if claimed or released
    const { revalidateTag } = await import('next/cache');
    revalidateTag('campaign-battles');
    if (claimed_territories.length > 0 || existingBattle.campaign_territory_id) {
      revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_TERRITORIES(campaignId));
      revalidateTag(`campaign-${campaignId}`);
      if (oldTerritoryGangId) {
        revalidateTag(CACHE_TAGS.COMPOSITE_GANG_CAMPAIGNS(oldTerritoryGangId));
      }
    }
    // Invalidate old winners so a removed gang's stats don't serve stale data.
    for (const oldId of oldWinnerIds) {
      revalidateTag(CACHE_TAGS.COMPOSITE_GANG_CAMPAIGNS(oldId));
    }
    // Invalidate every (new) winner's campaign cache so their stats refresh.
    for (const winnerId of effectiveWinnerIds) {
      revalidateTag(CACHE_TAGS.COMPOSITE_GANG_CAMPAIGNS(winnerId));
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
  try {
    const supabase = await createClient();

    // First, verify the battle exists and belongs to the campaign
    const { data: existingBattle, error: checkError } = await supabase
      .from('campaign_battles')
      .select('id, campaign_territory_id')
      .eq('id', battleId)
      .eq('campaign_id', campaignId)
      .single();

    if (checkError || !existingBattle) {
      console.error('Battle not found or access denied', checkError);
      throw new Error('Battle not found or access denied');
    }

    // Look up the gang currently holding the territory so we can invalidate their cache
    let releasedTerritoryGangId: string | null = null;
    if (existingBattle.campaign_territory_id) {
      const { data: territory } = await supabase
        .from('campaign_territories')
        .select('gang_id')
        .eq('id', existingBattle.campaign_territory_id)
        .single();
      releasedTerritoryGangId = territory?.gang_id ?? null;
    }

    // Release territory before deleting — if this fails, abort to avoid orphaning the territory
    if (existingBattle.campaign_territory_id) {
      const { error: releaseError } = await supabase
        .from('campaign_territories')
        .update({ gang_id: null })
        .eq('id', existingBattle.campaign_territory_id)
        .eq('campaign_id', campaignId);

      if (releaseError) {
        throw new Error(`Failed to release territory before deleting battle: ${releaseError.message}`);
      }
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

    // Invalidate battles cache and territory cache if needed
    const { revalidateTag } = await import('next/cache');
    revalidateTag('campaign-battles');
    if (existingBattle.campaign_territory_id) {
      revalidateTag(CACHE_TAGS.BASE_CAMPAIGN_TERRITORIES(campaignId));
      revalidateTag(`campaign-${campaignId}`);
      if (releasedTerritoryGangId) {
        revalidateTag(CACHE_TAGS.COMPOSITE_GANG_CAMPAIGNS(releasedTerritoryGangId));
      }
    }
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