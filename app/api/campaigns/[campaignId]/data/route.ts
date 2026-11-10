import {
  getCampaignBasic,
  getCampaignMembers,
  getCampaignTerritories,
  getCampaignBattles,
  getCampaignResources,
  getCampaignCaptives
} from "@/app/lib/campaigns/[id]/get-campaign-data";
import { getGangCore } from "@/app/lib/shared/gang-data";
import { publicDataOptions, publicDataResponse } from "@/utils/public-data-response";

export const OPTIONS = publicDataOptions;

// TypeScript interfaces for data structures

interface DataGangReference {
  id: string;
  name: string;
  type: string;
  colour: string;
}

interface DataTerritory {
  id: string;
  template_id: string | null;
  name: string;
  gang_id?: string;
  created_at: string;
  ruined: boolean;
  default_gang_territory: boolean;
  playing_card?: string | null;
  is_custom: boolean;
  owning_gangs: DataGangReference[];
}

interface DataGang {
  id: string;
  name: string;
  type: string;
  colour: string;
  status: string;
  rating: number;
  wealth: number;
  credits: number;
  reputation: number;
  territory_count: number;
  territories: DataTerritory[];
  resources: Array<{ resource_id: string; resource_name: string; quantity: number; is_custom: boolean }>;
}

interface DataBattle {
  id: string;
  created_at: string;
  updated_at: string;
  scenario: string;
  scenario_name: string;
  scenario_number: string | null;
  note: string;
  participants: any;
  campaign_territory_id: string | null;
  territory_id: string | null;
  territory_is_custom: boolean;
  territory_name?: string;
  attacker?: { id: string; name: string };
  defender?: { id: string; name: string };
  /**
   * Legacy single-winner field. For multi-winner battles this contains the
   * territory claimer (or the first listed winner when there is no claim).
   * `null`/absent for draws. Prefer `winners` for new consumers.
   */
  winner?: { id: string; name: string };
  /**
   * Multi-winner support. Every flagged winner is listed here; single-winner
   * battles emit a one-element array. Empty / absent for draws.
   */
  winners?: { id: string; name: string }[];
  /**
   * The gang that claimed the territory in this battle (if any). Always one of
   * `winners` when present.
   */
  territory_claimer?: { id: string; name: string } | null;
}

interface DataCaptive {
  fighter_id: string;
  fighter_name: string;
  fighter_type: string | null;
  original_gang_id: string | null;
  original_gang_name: string;
  holding_gang_id: string;
  holding_gang_name: string;
}

// Transformation functions to clean up data field names

/**
 * Transform gang data for data endpoint - maps directly from data structure
 * Data layer provides clean id/name, database names for gang_type/gang_colour
 */
function transformGangForData(gang: any): DataGang {
  return {
    id: gang.id, // Gang UUID
    name: gang.name,
    type: gang.gang_type,
    colour: gang.gang_colour,
    status: gang.status,
    rating: gang.rating,
    wealth: gang.wealth,
    credits: gang.credits,
    reputation: gang.reputation,
    territory_count: gang.territory_count,
    territories: (gang.territories ?? []).map((t: any) => transformTerritoryForData(t, true)),
    resources: gang.resources ?? []
  };
}

/**
 * Transform territory data for data endpoint - maps directly from data structure
 * @param territory - Territory data from database
 * @param isNested - If true, omits gang_id (when nested under gang)
 */
function transformTerritoryForData(territory: any, isNested: boolean = false): DataTerritory {
  const result: DataTerritory = {
    id: territory.id, // Unique campaign_territory ID
    template_id: territory.territory_id || null,
    name: territory.territory_name,
    created_at: territory.created_at,
    ruined: territory.ruined ?? false,
    default_gang_territory: territory.default_gang_territory ?? false,
    playing_card: territory.playing_card ?? null,
    is_custom: territory.is_custom ?? false,
    owning_gangs: (territory.owning_gangs ?? []).map((g: any) => ({
      id: g.id,
      name: g.name,
      type: g.gang_type,
      colour: g.gang_colour
    }))
  };

  // Only include gang_id for top-level territories (not nested under gangs)
  if (!isNested && territory.gang_id) {
    result.gang_id = territory.gang_id;
  }

  return result;
}

/**
 * Transform battle data for data endpoint - now just maps directly from clean structure
 * Data layer already provides clean field names (no more gang_ prefixes)
 */
function transformBattleForData(battle: any): DataBattle {
  const transformed: DataBattle = {
    id: battle.id,
    created_at: battle.created_at,
    updated_at: battle.updated_at,
    scenario: battle.scenario,
    scenario_name: battle.scenario_name,
    scenario_number: battle.scenario_number,
    note: battle.note,
    participants: battle.participants,
    campaign_territory_id: battle.campaign_territory_id || null,
    territory_id: null,
    territory_is_custom: false,
    territory_name: battle.territory_name
  };

  // Gang references already have clean field names from data layer
  if (battle.attacker) {
    transformed.attacker = {
      id: battle.attacker.id,
      name: battle.attacker.name
    };
  }

  if (battle.defender) {
    transformed.defender = {
      id: battle.defender.id,
      name: battle.defender.name
    };
  }

  if (battle.winner) {
    transformed.winner = {
      id: battle.winner.id,
      name: battle.winner.name
    };
  }

  // Multi-winner support — surface every winner and (optionally) the territory
  // claimer from the data-layer enrichment.
  if (Array.isArray(battle.winners) && battle.winners.length > 0) {
    transformed.winners = battle.winners.map((w: any) => ({
      id: w.id,
      name: w.name,
    }));
  }

  if (battle.territory_claimer) {
    transformed.territory_claimer = {
      id: battle.territory_claimer.id,
      name: battle.territory_claimer.name,
    };
  } else if (battle.territory_claimer === null) {
    transformed.territory_claimer = null;
  }

  return transformed;
}

/**
 * Flatten captives (grouped by holding gang) for data endpoint. A captive whose
 * own gang is hidden is left out, as hidden gangs publish no fighters.
 */
async function transformCaptivesForData(
  holdingGangs: Awaited<ReturnType<typeof getCampaignCaptives>>
): Promise<DataCaptive[]> {
  const captives = holdingGangs.flatMap(holder => holder.captives.map(captive => ({ holder, captive })));
  const originalGangIds = [...new Set(captives.flatMap(({ captive }) => captive.originalGangId ?? []))];
  const hiddenGangIds = new Set(
    (await Promise.all(originalGangIds.map(getGangCore)))
      .flatMap(gang => (gang?.hidden ? [gang.id] : []))
  );

  return captives
    .filter(({ captive }) => !captive.originalGangId || !hiddenGangIds.has(captive.originalGangId))
    .map(({ holder, captive }) => ({
      fighter_id: captive.fighterId,
      fighter_name: captive.fighterName,
      fighter_type: captive.fighterType ?? null,
      original_gang_id: captive.originalGangId,
      original_gang_name: captive.originalGangName,
      holding_gang_id: holder.gangId,
      holding_gang_name: holder.gangName
    }));
}

export async function GET(request: Request, props: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await props.params;

  return publicDataResponse(request, campaignId, 'Campaign', async () => {
    // Fetch all campaign data using existing cached functions
    const [
      campaignBasic,
      campaignMembers,
      campaignTerritories,
      campaignBattles,
      campaignResources,
      campaignCaptives
    ] = await Promise.all([
      getCampaignBasic(campaignId),
      getCampaignMembers(campaignId),
      getCampaignTerritories(campaignId),
      getCampaignBattles(campaignId, 100),
      getCampaignResources(campaignId),
      getCampaignCaptives(campaignId)
    ]);

    if (!campaignBasic) return null;

    const captives = await transformCaptivesForData(campaignCaptives);

    // Transform members data to include territories under their gangs
    // Note: We exclude auth user IDs for privacy, only include campaign-scoped IDs
    const membersWithTerritories = campaignMembers.map(member => {
      const gangsWithTerritories = member.gangs.map(gang => {
        // Find territories owned by this gang
        const gangTerritories = campaignTerritories.filter(
          territory => territory.gang_id === gang.id
        );

        return transformGangForData({
          ...gang,
          territories: gangTerritories
        });
      });

      return {
        user_info: {
          campaign_member_id: member.id,
          username: member.username,
          role: member.role,
          invited_at: member.invited_at,
          joined_at: member.joined_at
        },
        gangs: gangsWithTerritories
      };
    });

    // Build the data structure
    return {
      campaign: {
        id: campaignBasic.id,
        campaign_name: campaignBasic.campaign_name,
        campaign_type_id: campaignBasic.campaign_type_id,
        campaign_type_name: (campaignBasic.campaign_types as any)?.campaign_type_name || '',
        campaign_type_image_url: (campaignBasic.campaign_types as any)?.image_url || '',
        campaign_portrait_id: campaignBasic.campaign_portrait_id ?? null,
        campaign_portrait_url: campaignBasic.campaign_portrait_url ?? null,
        image_url: campaignBasic.image_url || '',
        status: campaignBasic.status,
        description: campaignBasic.description,
        created_at: campaignBasic.created_at,
        updated_at: campaignBasic.updated_at,
        note: campaignBasic.note
      },
      members: membersWithTerritories,
      resources: campaignResources,
      available_territories: campaignTerritories.map(t => transformTerritoryForData(t, false)),
      battle_logs: campaignBattles.map(transformBattleForData),
      captives
    };
  }, 'campaign_data', `campaign_${campaignId}.xml`);
}
