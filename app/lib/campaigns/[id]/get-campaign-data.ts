import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { and, count, eq, isNotNull } from 'drizzle-orm';

import { getAppDb } from '@/utils/db/client';
import { campaignTerritories } from '@/utils/db/schema';
import type { CampaignAllegiance } from '@/utils/campaigns/allegiances';
import { getWinnerIds, getClaimerGangId } from '@/utils/battle-winners';
import type { CampaignResource } from '@/utils/campaigns/resources';
import { CAMPAIGN_TERRITORY_FIELDS, shapeCampaignTerritory } from '@/utils/campaigns/territories';
import { sumFighterKills } from '@/app/lib/shared/gang-data';
import { groupBy } from '@/utils/gang-assembly';
import { joinedParentGangTypeName } from '@/utils/gang-type-label';
import { isUuid } from '@/utils/uuid';
import type { CampaignMapBundle } from '@/types/campaign';

// No TTL - infinite cache with server action invalidation only
// Cache only expires when explicitly invalidated via revalidateTag()

async function _getCampaignBasic(campaignId: string) {
  const campaign = await getAppDb().query.campaigns.findFirst({
    columns: {
      id: true,
      campaign_name: true,
      campaign_type_id: true,
      status: true,
      description: true,
      trading_posts: true,
      custom_trading_posts: true,
      note: true,
      image_url: true,
      discord_guild_id: true,
      discord_channel_id: true,
      allow_join_requests: true,
      current_cycle: true,
      current_phase: true,
    },
    extras: (campaign, { sql }) => ({
      created_at: sql<string>`to_json(${campaign.created_at})`.as('created_at'),
      updated_at: sql<string | null>`to_json(${campaign.updated_at})`.as('updated_at'),
    }),
    where: (campaign, { eq }) => eq(campaign.id, campaignId),
    with: {
      campaign_type: {
        columns: { campaign_type_name: true, image_url: true },
        with: { editions: { columns: { slug: true } } },
      },
    },
  });
  if (!campaign) return null;

  const { campaign_type, ...campaignRow } = campaign;
  return {
    ...campaignRow,
    campaign_types: campaign_type?.campaign_type_name ? {
      campaign_type_name: campaign_type.campaign_type_name,
      image_url: campaign_type.image_url || '',
      edition_slug: campaign_type.editions?.slug ?? null
    } : null
  };
}

async function _getCampaignMembers(campaignId: string) {
  const db = getAppDb();
  const [members, memberGangs, territoryCounts] = await Promise.all([
    db.query.campaignMembers.findMany({
      columns: { id: true, user_id: true, role: true, invited_by: true },
      extras: (member, { sql }) => ({
        invited_at: sql<string | null>`to_json(${member.invited_at})`.as('invited_at'),
        joined_at: sql<string | null>`to_json(${member.joined_at})`.as('joined_at'),
      }),
      where: (member, { eq }) => eq(member.campaign_id, campaignId),
      with: { profile: { columns: { id: true, username: true, updated_at: true, user_role: true } } },
    }),
    // ACCEPTED and PENDING gangs; pending ones are shown with a label
    db.query.campaignGangs.findMany({
      columns: { id: true, gang_id: true, campaign_member_id: true, status: true },
      where: (cg, { and, eq, inArray }) =>
        and(eq(cg.campaign_id, campaignId), inArray(cg.status, ['ACCEPTED', 'PENDING'])),
      with: {
        gang: {
          columns: {
            name: true,
            gang_type: true,
            gang_type_id: true,
            gang_colour: true,
            reputation: true,
            rating: true,
            wealth: true,
            credits: true,
            trade_points: true,
          },
          with: { gang_types: { columns: { parent_gang_type_name: true } } },
        },
        campaign_type_allegiance: { columns: { id: true, allegiance_name: true } },
        campaign_allegiance: { columns: { id: true, allegiance_name: true } },
        campaign_gang_resources: {
          columns: { campaign_type_resource_id: true, campaign_resource_id: true, quantity: true },
          with: {
            campaign_type_resource: { columns: { resource_name: true } },
            campaign_resource: { columns: { resource_name: true } },
          },
        },
      },
    }),
    db
      .select({ gang_id: campaignTerritories.gang_id, count: count() })
      .from(campaignTerritories)
      .where(and(eq(campaignTerritories.campaign_id, campaignId), isNotNull(campaignTerritories.gang_id)))
      .groupBy(campaignTerritories.gang_id),
  ]);

  const territoryCountByGang = new Map(territoryCounts.map((t) => [t.gang_id, t.count]));
  const gangsByMember = groupBy(memberGangs, 'campaign_member_id');

  return members.map((member) => ({
    id: member.id,
    user_id: member.user_id,
    username: member.profile?.username || '',
    role: member.role,
    invited_at: member.invited_at,
    joined_at: member.joined_at,
    invited_by: member.invited_by,
    profile: {
      id: member.profile?.id || '',
      username: member.profile?.username || '',
      updated_at: member.profile?.updated_at || '',
      user_role: member.profile?.user_role || ''
    },
    gangs: (gangsByMember[member.id] ?? []).map((cg) => {
      const allegiance = cg.campaign_type_allegiance ?? cg.campaign_allegiance;
      return {
        // Relationship metadata
        campaign_gang_id: cg.id,
        campaign_member_id: cg.campaign_member_id,
        status: cg.status,

        // Gang data (clean names for id/name, database names for gang_type/gang_colour)
        id: cg.gang_id,
        name: cg.gang?.name || '',
        gang_type: cg.gang?.gang_type || '',
        gang_type_id: cg.gang?.gang_type_id ?? null,
        parent_gang_type_name: joinedParentGangTypeName(cg.gang?.gang_types),
        gang_colour: cg.gang?.gang_colour || '#000000',
        rating: cg.gang?.rating || 0,
        wealth: cg.gang?.wealth || 0,
        credits: cg.gang?.credits || 0,
        trade_points: cg.gang?.trade_points || 0,
        reputation: cg.gang?.reputation || 0,
        territory_count: territoryCountByGang.get(cg.gang_id) || 0,

        // Normalised resources from campaign_gang_resources table
        resources: cg.campaign_gang_resources.flatMap((gr) => {
          const isCustom = !!gr.campaign_resource_id;
          const resourceId = gr.campaign_type_resource_id || gr.campaign_resource_id;
          const resourceName = (isCustom ? gr.campaign_resource : gr.campaign_type_resource)?.resource_name;
          return resourceId && resourceName
            ? [{ resource_id: resourceId, resource_name: resourceName, quantity: gr.quantity, is_custom: isCustom }]
            : [];
        }),

        // Allegiance information
        allegiance: allegiance ? {
          id: allegiance.id,
          name: allegiance.allegiance_name,
          is_custom: !cg.campaign_type_allegiance
        } : null
      };
    })
  }));
}

async function _getCampaignTerritories(campaignId: string) {
  const territories = await getAppDb().query.campaignTerritories.findMany({
    columns: CAMPAIGN_TERRITORY_FIELDS,
    extras: (territory, { sql }) => ({
      created_at: sql<string>`to_json(${territory.created_at})`.as('created_at'),
    }),
    where: (territory, { eq }) => eq(territory.campaign_id, campaignId),
    with: {
      gang: {
        columns: { id: true, name: true, gang_type: true, gang_colour: true },
        with: { gang_types: { columns: { parent_gang_type_name: true } } },
      },
      // Catalog/template name for Reset-to-original in the edit modal
      territory: { columns: { territory_name: true } },
    },
  });

  return territories.map(({ gang, territory, ...row }) => ({
    ...shapeCampaignTerritory(row, territory?.territory_name ?? null),
    owning_gangs: gang ? [{
      id: gang.id,
      name: gang.name || '',
      gang_type: gang.gang_type || '',
      parent_gang_type_name: joinedParentGangTypeName(gang.gang_types),
      gang_colour: gang.gang_colour || '#000000'
    }] : []
  }));
}

async function _getCampaignBattles(campaignId: string, limit: number) {
  const db = getAppDb();
  const battles = await db.query.campaignBattles.findMany({
    columns: {
      id: true,
      scenario: true,
      deployment_id: true,
      objective_id: true,
      crew_selection_id: true,
      deployment_name: true,
      objective_name: true,
      crew_selection_name: true,
      note: true,
      participants: true,
      campaign_territory_id: true,
      cycle: true,
      status: true,
      challenger_gang_id: true,
      challenged_gang_id: true,
      challenge_order: true,
    },
    extras: (battle, { sql }) => ({
      created_at: sql<string>`to_json(${battle.created_at})`.as('created_at'),
      updated_at: sql<string | null>`to_json(${battle.updated_at})`.as('updated_at'),
    }),
    where: (battle, { eq }) => eq(battle.campaign_id, campaignId),
    orderBy: (battle, { desc }) => desc(battle.created_at),
    limit,
    with: {
      scenario_details: { columns: { scenario_name: true, scenario_number: true } },
      campaign_territory: { columns: { territory_name: true } },
    },
  });

  const gangIdSet = new Set<string>();
  const parsedParticipantsMap = new Map<string, any[]>();
  battles.forEach(b => {
    if (b.participants) {
      try {
        const parsed = typeof b.participants === 'string' ? JSON.parse(b.participants) : b.participants;
        if (Array.isArray(parsed)) {
          parsedParticipantsMap.set(b.id, parsed);
          parsed.forEach((p: any) => {
            if (p.gang_id) gangIdSet.add(p.gang_id);
          });
        }
      } catch { /* ignore */ }
    }
  });

  const gangIds = Array.from(gangIdSet);
  const gangs = gangIds.length > 0
    ? await db.query.gangs.findMany({
        columns: { id: true, name: true },
        where: (gang, { inArray }) => inArray(gang.id, gangIds),
      })
    : [];
  const gangMap = new Map(gangs.map(gang => [gang.id, gang]));

  return battles.map(battle => {
    const scenarioDetails = battle.scenario_details;

    const parsedParticipants = parsedParticipantsMap.get(battle.id);
    const attackerId = parsedParticipants?.find((p: any) => p.role === 'attacker')?.gang_id;
    const defenderId = parsedParticipants?.find((p: any) => p.role === 'defender')?.gang_id;

    // The already-parsed participants array is passed, so the raw JSON column isn't re-parsed.
    const parsed = parsedParticipants ?? [];
    const effectiveWinnerIds = getWinnerIds({ participants: parsed });
    const winners = effectiveWinnerIds.map((id) => ({
      id,
      name: gangMap.get(id)?.name || 'Unknown',
    }));
    const claimerId = getClaimerGangId({ participants: parsed });
    const territory_claimer = claimerId
      ? { id: claimerId, name: gangMap.get(claimerId)?.name || 'Unknown' }
      : null;

    return {
      id: battle.id,
      created_at: battle.created_at,
      updated_at: battle.updated_at,
      scenario: battle.scenario || scenarioDetails?.scenario_name || '',
      scenario_name: scenarioDetails?.scenario_name || '',
      scenario_number: scenarioDetails?.scenario_number || null,
      deployment_id: battle.deployment_id,
      objective_id: battle.objective_id,
      crew_selection_id: battle.crew_selection_id,
      deployment_name: battle.deployment_name,
      objective_name: battle.objective_name,
      crew_selection_name: battle.crew_selection_name,
      note: battle.note,
      participants: battle.participants,
      campaign_territory_id: battle.campaign_territory_id,
      territory_name: battle.campaign_territory?.territory_name ?? undefined,
      cycle: battle.cycle,
      status: battle.status,
      challenger_gang_id: battle.challenger_gang_id,
      challenged_gang_id: battle.challenged_gang_id,
      challenge_order: battle.challenge_order,
      attacker: attackerId ? {
        id: attackerId,
        name: gangMap.get(attackerId)?.name || 'Unknown'
      } : undefined,
      defender: defenderId ? {
        id: defenderId,
        name: gangMap.get(defenderId)?.name || 'Unknown'
      } : undefined,
      winner: territory_claimer ?? winners[0],
      winners,
      territory_claimer,
    };
  });
}

/** A campaign type's predefined entries (none for a Custom campaign), then the campaign's own. */
function typeThenCustom<T>(typeName: string | null, typeEntries: T[], customEntries: T[]) {
  return [
    ...(typeName === 'Custom' ? [] : typeEntries).map((entry) => ({ ...entry, is_custom: false })),
    ...customEntries.map((entry) => ({ ...entry, is_custom: true })),
  ];
}

async function _getCampaignAllegiances(campaignId: string): Promise<CampaignAllegiance[]> {
  const campaign = await getAppDb().query.campaigns.findFirst({
    columns: {},
    where: (campaign, { eq }) => eq(campaign.id, campaignId),
    with: {
      campaign_type: {
        columns: { campaign_type_name: true },
        with: {
          campaign_type_allegiances: {
            columns: { id: true, allegiance_name: true },
            orderBy: (allegiance, { asc }) => asc(allegiance.allegiance_name),
          },
        },
      },
      campaign_allegiances: {
        columns: { id: true, allegiance_name: true },
        orderBy: (allegiance, { asc }) => asc(allegiance.allegiance_name),
      },
    },
  });
  if (!campaign?.campaign_type) return [];
  const { campaign_type: type } = campaign;
  return typeThenCustom(type.campaign_type_name, type.campaign_type_allegiances, campaign.campaign_allegiances);
}

async function _getCampaignResources(campaignId: string): Promise<CampaignResource[]> {
  const campaign = await getAppDb().query.campaigns.findFirst({
    columns: {},
    where: (campaign, { eq }) => eq(campaign.id, campaignId),
    with: {
      campaign_type: {
        columns: { campaign_type_name: true },
        with: {
          campaign_type_resources: {
            columns: { id: true, resource_name: true },
            orderBy: (resource, { asc }) => asc(resource.resource_name),
          },
        },
      },
      campaign_resources: {
        columns: { id: true, resource_name: true },
        orderBy: (resource, { asc }) => asc(resource.resource_name),
      },
    },
  });
  if (!campaign?.campaign_type) return [];
  const { campaign_type: type } = campaign;
  return typeThenCustom(type.campaign_type_name, type.campaign_type_resources, campaign.campaign_resources);
}

// Every entry below is keyed by campaign id alone and shared by every viewer. The
// direct connection reads what the read policies give any signed-in user (every row
// of these tables), not what the viewer may see, so callers check access.

/**
 * Get gang IDs for a campaign (cached)
 * Used internally to build cache tags for getCampaignMembers
 */
const getCampaignGangIds = async (campaignId: string) => {
  return unstable_cache(
    async () => {
      const rows = await getAppDb().query.campaignGangs.findMany({
        columns: { gang_id: true },
        where: (cg, { eq }) => eq(cg.campaign_id, campaignId),
      });
      return rows.flatMap((cg) => cg.gang_id ?? []);
    },
    [`campaign-gang-ids-v2-${campaignId}`],
    {
      tags: [TAGS.campaignMembers(campaignId)],
      revalidate: false
    }
  )();
};

/**
 * Get campaign basic information with persistent caching
 * Cache key: campaign-basic-{campaignId}
 * Invalidation: Server actions only via revalidateTag()
 */
export const getCampaignBasic = async (campaignId: string) => {
  // The id comes from the URL; Postgres would reject a malformed one
  if (!isUuid(campaignId)) return null;

  return unstable_cache(
    async () => {
      return _getCampaignBasic(campaignId);
    },
    [`campaign-basic-v4-${campaignId}`],
    {
      tags: [TAGS.campaignCore(campaignId)],
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
  // Get gang IDs using cached helper - only hits DB on cache miss
  const gangIds = await getCampaignGangIds(campaignId);

  // This entry is a fan-in: as well as membership it shows each gang's territory
  // count and resource quantities, so it subscribes to those subjects too.
  const cacheTags = [
    TAGS.campaignMembers(campaignId),
    TAGS.campaignTerritories(campaignId),
    TAGS.campaignAllegiances(campaignId),
    TAGS.campaignResources(campaignId),
    TAGS.globalGangTypes(),
    // Per-gang overview tags: standings refresh when a member gang's
    // rating/wealth/credits/name actually change (fired by the
    // updateGangFinancials choke point), NOT on every fighter edit —
    // xp ticks during battles must not rebuild campaign pages.
    ...gangIds.map(gangId => TAGS.gangOverview(gangId))
  ];

  return unstable_cache(
    async () => {
      return _getCampaignMembers(campaignId);
    },
    [`campaign-members-v5-${campaignId}`],
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
  // Owning gang names and colours are copied in here, so the entry subscribes to
  // each member gang's overview tag rather than to every gang mutation.
  const gangIds = await getCampaignGangIds(campaignId);
  return unstable_cache(
    async () => {
      return _getCampaignTerritories(campaignId);
    },
    [`campaign-territories-v4-${campaignId}`],
    {
      tags: [
        TAGS.campaignTerritories(campaignId),
        TAGS.globalGangTypes(),
        // The catalog name is read in for Reset, so an admin edit to a territory refreshes this entry
        TAGS.globalTerritories(),
        ...gangIds.map(gangId => TAGS.gangOverview(gangId))
      ],
      revalidate: false
    }
  )();
};

/**
 * Get campaign battles with persistent caching
 * Cache key: campaign-battles-{campaignId}-{limit}
 * Invalidation: Server actions only via revalidateTag()
 */
export const getCampaignBattles = async (campaignId: string, limit = 100) => {
  // Participant and winner names are resolved here, so the same gang-overview
  // subscription as territories applies.
  const gangIds = await getCampaignGangIds(campaignId);
  return unstable_cache(
    async () => {
      return _getCampaignBattles(campaignId, limit);
    },
    [`campaign-battles-v2-${campaignId}-${limit}`],
    {
      tags: [
        TAGS.campaignBattles(campaignId),
        // territory_name for a claimed territory is copied in here too
        TAGS.campaignTerritories(campaignId),
        ...gangIds.map(gangId => TAGS.gangOverview(gangId))
      ],
      revalidate: false
    }
  )();
};

/**
 * Get available allegiances for a campaign
 * Returns custom allegiances for custom campaigns, or predefined allegiances for other campaign types
 */
export async function getCampaignAllegiances(campaignId: string) {
  return unstable_cache(
    async () => {
      return _getCampaignAllegiances(campaignId);
    },
    [`campaign-allegiances-v2-${campaignId}`],
    {
      tags: [TAGS.campaignAllegiances(campaignId)],
      revalidate: false
    }
  )();
}

/**
 * Get captives held by gangs in a campaign.
 * Returns fighters captured by campaign gangs, grouped by holding gang.
 * Not cached - captives change when fighters are captured/rescued.
 */
export async function getCampaignCaptives(campaignId: string) {
  // Captives change on fighter capture/rescue, which fires gang-{id} for the
  // capturing gang — so this entry subscribes to each member gang's tag in
  // addition to its own subject.
  const gangIds = await getCampaignGangIds(campaignId);
  return unstable_cache(
    async () => {
      return _getCampaignCaptives(campaignId);
    },
    [`campaign-captives-v2-${campaignId}`],
    {
      tags: [
        TAGS.campaignCaptives(campaignId),
        ...gangIds.map((id: string) => TAGS.gang(id))
      ],
      revalidate: false
    }
  )();
}

async function _getCampaignCaptives(campaignId: string) {
  const holders = await getAppDb().query.campaignGangs.findMany({
    columns: { gang_id: true },
    where: (cg, { and, eq }) => and(eq(cg.campaign_id, campaignId), eq(cg.status, 'ACCEPTED')),
    with: {
      gang: {
        columns: { name: true },
        with: {
          captives: {
            columns: { id: true, fighter_name: true, fighter_type: true },
            where: (fighter, { eq }) => eq(fighter.captured, true),
            with: { gang: { columns: { name: true } } },
          },
        },
      },
    },
  });

  // Keyed by gang, so a gang listed twice in the campaign still shows once
  const byHoldingGang = new Map<string, { gangId: string; gangName: string; captives: Array<{ fighterId: string; fighterName: string; fighterType?: string; originalGangName: string }> }>();
  for (const { gang_id, gang } of holders) {
    if (!gang_id || !gang?.captives.length) continue;
    byHoldingGang.set(gang_id, {
      gangId: gang_id,
      gangName: gang.name ?? 'Unknown',
      captives: gang.captives.map((f) => ({
        fighterId: f.id,
        fighterName: f.fighter_name ?? 'Unknown',
        fighterType: f.fighter_type ?? undefined,
        originalGangName: f.gang?.name ?? 'Unknown'
      }))
    });
  }

  return [...byHoldingGang.values()].sort((a, b) => a.gangName.localeCompare(b.gangName));
}

async function _getCampaignOoaCounts(gangIds: string[]) {
  if (gangIds.length === 0) return [];

  const fighters = await getAppDb().query.fighters.findMany({
    columns: { gang_id: true, kills: true },
    // Fighters without kills add nothing to the sum.
    where: (fighter, { and, gt, inArray }) => and(inArray(fighter.gang_id, gangIds), gt(fighter.kills, 0)),
  });

  return Object.entries(groupBy(fighters, 'gang_id'))
    .map(([gang_id, list]) => ({ gang_id, ooa_count: sumFighterKills(list) }));
}

/**
 * Get each gang's "OOA caused" for a campaign (Slaughterer triumph): the sum
 * of its fighters' kills, the same number the gang page shows
 * (getGangFighterStats). One query covers all the campaign's gangs.
 */
export const getCampaignOoaCounts = async (campaignId: string) => {
  const gangIds = await getCampaignGangIds(campaignId);
  return unstable_cache(
    async () => {
      return _getCampaignOoaCounts(gangIds);
    },
    [`campaign-ooa-counts-v2-${campaignId}`],
    {
      tags: [
        TAGS.campaignMembers(campaignId),
        // The gang page's stats use the same tag, so both refresh together.
        ...gangIds.map(gangId => TAGS.gangRoster(gangId))
      ],
      revalidate: false
    }
  )();
};

/**
 * Get available resources for a campaign
 * Returns predefined campaign type resources and custom campaign resources
 */
export async function getCampaignResources(campaignId: string) {
  return unstable_cache(
    async () => {
      return _getCampaignResources(campaignId);
    },
    [`campaign-resources-v2-${campaignId}`],
    {
      tags: [TAGS.campaignResources(campaignId)],
      revalidate: false
    }
  )();
}

// ---------------------------------------------------------------------------
// Campaign Map
// ---------------------------------------------------------------------------

async function _getCampaignMapWithObjects(campaignId: string): Promise<CampaignMapBundle> {
  const map = await getAppDb().query.campaignMaps.findFirst({
    columns: { id: true, campaign_id: true, background_image_url: true, hex_grid_enabled: true, hex_size: true },
    extras: (map, { sql }) => ({
      created_at: sql<string>`to_json(${map.created_at})`.as('created_at'),
      updated_at: sql<string | null>`to_json(${map.updated_at})`.as('updated_at'),
    }),
    where: (map, { eq }) => eq(map.campaign_id, campaignId),
    with: {
      campaign_map_objects: {
        columns: {
          id: true,
          campaign_map_id: true,
          object_type: true,
          geometry: true,
          properties: true,
          created_at: true,
          updated_at: true,
        },
      },
    },
  });
  if (!map) return { map: null, objects: [] };

  const { campaign_map_objects: objects, ...mapRow } = map;
  return {
    map: mapRow,
    objects: objects.map((object) => ({ ...object, properties: object.properties ?? {} })),
  };
}

export const getCampaignMapWithObjects = async (
  campaignId: string
): Promise<CampaignMapBundle> => {
  return unstable_cache(
    async () => {
      return _getCampaignMapWithObjects(campaignId);
    },
    [`campaign-map-v2-${campaignId}`],
    {
      tags: [TAGS.campaignMap(campaignId)],
      revalidate: false
    }
  )();
};

/**
 * Custom trading posts shared into a campaign (campaign page shop config).
 * Cache: campaign-{id} — fired by the custom-share action.
 */
export async function getCampaignSharedTradingPosts(campaignId: string) {
  return unstable_cache(
    async () => {
      const shares = await getAppDb().query.customShared.findMany({
        columns: {},
        where: (share, { and, eq, isNotNull }) =>
          and(eq(share.campaign_id, campaignId), isNotNull(share.custom_trading_post_id)),
        with: {
          custom_trading_post: {
            columns: { id: true, custom_trading_post_name: true },
            with: { editions: { columns: { slug: true } } },
          },
        },
      });

      return shares.flatMap(({ custom_trading_post: post }) => post ? [{
        id: post.id,
        trading_post_name: post.custom_trading_post_name,
        edition_slug: post.editions?.slug ?? null,
      }] : []);
    },
    [`campaign-shared-trading-posts-v3-${campaignId}`],
    {
      tags: [TAGS.campaignTradingPosts(campaignId)],
      revalidate: false
    }
  )();
}
