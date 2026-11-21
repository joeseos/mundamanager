import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';

import { desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { getAppDb } from '@/utils/db/client';
import { liveBattleParticipants, liveBattles } from '@/utils/db/schema';
import { normalizeLiveBattleRecord, type LiveBattle, type LiveBattleFull } from '@/types/live-battle';
import { getCampaignResources } from '@/app/lib/campaigns/[id]/get-campaign-data';
import { withEditionSlug } from '@/types/edition';
import { isUuid } from '@/utils/uuid';

/** N26: the names of a live battle's Deployment, Objective and Crew, for display. */
export const LIVE_BATTLE_SCENARIO_PARTS_SELECT =
  'deployment:scenario_table_entries!deployment_id ( name ), ' +
  'objective:scenario_table_entries!objective_id ( name ), ' +
  'crew_selection:scenario_table_entries!crew_selection_id ( name )';

/** A live battle row as LiveBattle has it, before withEditionSlug. */
const LIVE_BATTLE_ROW = {
  columns: { created_at: false, updated_at: false },
  extras: {
    created_at: sql<string>`to_json(${liveBattles.created_at})`.as('created_at'),
    updated_at: sql<string>`to_json(${liveBattles.updated_at})`.as('updated_at'),
  },
  with: {
    editions: { columns: { slug: true } },
    deployment: { columns: { name: true } },
    objective: { columns: { name: true } },
    crew_selection: { columns: { name: true } },
  },
} as const;

export async function fetchLiveBattleDirect(liveBattleId: string): Promise<LiveBattleFull | null> {
  if (!isUuid(liveBattleId)) return null;

  const db = getAppDb();
  const liveBattle = await db.query.liveBattles.findFirst({
    ...LIVE_BATTLE_ROW,
    where: eq(liveBattles.id, liveBattleId),
    with: {
      ...LIVE_BATTLE_ROW.with,
      linked_battle: { columns: { campaign_territory_id: true, cycle: true, note: true } },
      campaign: {
        columns: { campaign_name: true },
        with: {
          campaign_gangs: {
            columns: { id: true, gang_id: true },
            where: (campaignGang) =>
              inArray(
                campaignGang.gang_id,
                db
                  .select({ gang_id: liveBattleParticipants.gang_id })
                  .from(liveBattleParticipants)
                  .where(eq(liveBattleParticipants.live_battle_id, liveBattleId))
              ),
          },
        },
      },
      participants: {
        orderBy: (participant, { asc }) => [asc(participant.created_at), asc(participant.id)],
        with: {
          gang: { columns: { id: true, name: true, gang_type_id: true, gang_colour: true, rating: true } },
          profile: { columns: { username: true, patreon_tier_id: true, patreon_tier_title: true } },
          fighters: {
            orderBy: (liveBattleFighter, { asc }) => [asc(liveBattleFighter.created_at), asc(liveBattleFighter.id)],
            with: { fighter: { columns: { id: true, fighter_name: true, credits: true, special_rules: true } } },
          },
        },
      },
    },
  });
  if (!liveBattle) return null;

  // The edition slug is flattened here rather than in the page: the realtime
  // hook refetches through this function, so a field merged downstream would
  // render once and then disappear on the first refresh.
  const { campaign, participants, ...liveBattleRow } = liveBattle;
  const liveBattleBase = { ...withEditionSlug(liveBattleRow), campaign_name: campaign?.campaign_name };

  if (participants.length === 0) {
    return { ...liveBattleBase, participants: [] };
  }

  const campaignResources = liveBattle.campaign_id ? await getCampaignResources(liveBattle.campaign_id) : [];
  const campaignGangIds: Record<string, string> = {};
  for (const cg of campaign?.campaign_gangs ?? []) {
    if (cg.gang_id) campaignGangIds[cg.gang_id] = cg.id;
  }

  return {
    ...liveBattleBase,
    participants: participants.map(({ gang, profile, fighters, ...participant }) => ({
      ...participant,
      gang: gang ?? undefined,
      profile: profile ?? undefined,
      fighters: fighters.map(({ fighter, ...liveBattleFighter }) => ({
        ...liveBattleFighter,
        live_battle_record: normalizeLiveBattleRecord(liveBattleFighter.live_battle_record),
        fighter: fighter ?? undefined,
      })),
    })),
    campaign_resources: campaignResources.length > 0 ? campaignResources : undefined,
    campaign_gang_ids: Object.keys(campaignGangIds).length > 0 ? campaignGangIds : undefined,
  };
}

export const getLiveBattleCached = async (liveBattleId: string): Promise<LiveBattleFull | null> => {
  return unstable_cache(
    () => fetchLiveBattleDirect(liveBattleId),
    [`live-battle-${liveBattleId}`],
    {
      tags: [TAGS.liveBattle(liveBattleId)],
      revalidate: false,
    }
  )();
};

async function listLiveBattles(where: SQL): Promise<LiveBattle[]> {
  const rows = await getAppDb().query.liveBattles.findMany({
    ...LIVE_BATTLE_ROW,
    where,
    orderBy: desc(liveBattles.updated_at),
  });
  return rows.map(withEditionSlug);
}

export const getGangLiveBattlesCached = async (gangId: string): Promise<LiveBattle[]> => {
  return unstable_cache(
    () =>
      listLiveBattles(
        inArray(
          liveBattles.id,
          getAppDb()
            .select({ id: liveBattleParticipants.live_battle_id })
            .from(liveBattleParticipants)
            .where(eq(liveBattleParticipants.gang_id, gangId))
        )
      ),
    [`gang-live-battles-${gangId}`],
    {
      tags: [TAGS.gangLiveBattles(gangId)],
      revalidate: false,
    }
  )();
};

export const getCampaignLiveBattles = (campaignId: string): Promise<LiveBattle[]> =>
  listLiveBattles(eq(liveBattles.campaign_id, campaignId));
