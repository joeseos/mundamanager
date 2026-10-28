import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';

import { desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { getAppDb } from '@/utils/db/client';
import { battleSessionParticipants, battleSessions } from '@/utils/db/schema';
import { normalizeSessionRecord, type BattleSession, type BattleSessionFull } from '@/types/battle-session';
import { getCampaignResources } from '@/app/lib/campaigns/[id]/get-campaign-data';
import { withEditionSlug } from '@/types/edition';
import { isUuid } from '@/utils/uuid';

/** N26: the names of a session's Deployment, Objective and Crew, for display. */
export const SESSION_SCENARIO_PARTS_SELECT =
  'deployment:scenario_table_entries!battle_sessions_deployment_id_fkey ( name ), ' +
  'objective:scenario_table_entries!battle_sessions_objective_id_fkey ( name ), ' +
  'crew_selection:scenario_table_entries!battle_sessions_crew_selection_id_fkey ( name )';

/** A session row as BattleSession has it, before withEditionSlug. */
const SESSION_ROW = {
  columns: { created_at: false, updated_at: false },
  extras: {
    created_at: sql<string>`to_json(${battleSessions.created_at})`.as('created_at'),
    updated_at: sql<string>`to_json(${battleSessions.updated_at})`.as('updated_at'),
  },
  with: {
    editions: { columns: { slug: true } },
    deployment: { columns: { name: true } },
    objective: { columns: { name: true } },
    crew_selection: { columns: { name: true } },
  },
} as const;

export async function fetchBattleSessionDirect(sessionId: string): Promise<BattleSessionFull | null> {
  if (!isUuid(sessionId)) return null;

  const db = getAppDb();
  const session = await db.query.battleSessions.findFirst({
    ...SESSION_ROW,
    where: eq(battleSessions.id, sessionId),
    with: {
      ...SESSION_ROW.with,
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
                  .select({ gang_id: battleSessionParticipants.gang_id })
                  .from(battleSessionParticipants)
                  .where(eq(battleSessionParticipants.battle_session_id, sessionId))
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
            orderBy: (sessionFighter, { asc }) => [asc(sessionFighter.created_at), asc(sessionFighter.id)],
            with: { fighter: { columns: { id: true, fighter_name: true, credits: true, special_rules: true } } },
          },
        },
      },
    },
  });
  if (!session) return null;

  // The edition slug is flattened here rather than in the page: the realtime
  // hook refetches through this function, so a field merged downstream would
  // render once and then disappear on the first refresh.
  const { campaign, participants, ...sessionRow } = session;
  const sessionBase = { ...withEditionSlug(sessionRow), campaign_name: campaign?.campaign_name };

  if (participants.length === 0) {
    return { ...sessionBase, participants: [] };
  }

  const campaignResources = session.campaign_id ? await getCampaignResources(session.campaign_id) : [];
  const campaignGangIds: Record<string, string> = {};
  for (const cg of campaign?.campaign_gangs ?? []) {
    if (cg.gang_id) campaignGangIds[cg.gang_id] = cg.id;
  }

  return {
    ...sessionBase,
    participants: participants.map(({ gang, profile, fighters, ...participant }) => ({
      ...participant,
      gang: gang ?? undefined,
      profile: profile ?? undefined,
      fighters: fighters.map(({ fighter, ...sessionFighter }) => ({
        ...sessionFighter,
        session_record: normalizeSessionRecord(sessionFighter.session_record),
        fighter: fighter ?? undefined,
      })),
    })),
    campaign_resources: campaignResources.length > 0 ? campaignResources : undefined,
    campaign_gang_ids: Object.keys(campaignGangIds).length > 0 ? campaignGangIds : undefined,
  };
}

export const getBattleSessionCached = async (sessionId: string): Promise<BattleSessionFull | null> => {
  return unstable_cache(
    () => fetchBattleSessionDirect(sessionId),
    [`battle-session-${sessionId}`],
    {
      tags: [TAGS.battleSession(sessionId)],
      revalidate: false,
    }
  )();
};

async function listBattleSessions(where: SQL): Promise<BattleSession[]> {
  const sessions = await getAppDb().query.battleSessions.findMany({
    ...SESSION_ROW,
    where,
    orderBy: desc(battleSessions.updated_at),
  });
  return sessions.map(withEditionSlug);
}

export const getGangBattleSessionsCached = async (gangId: string): Promise<BattleSession[]> => {
  return unstable_cache(
    () =>
      listBattleSessions(
        inArray(
          battleSessions.id,
          getAppDb()
            .select({ id: battleSessionParticipants.battle_session_id })
            .from(battleSessionParticipants)
            .where(eq(battleSessionParticipants.gang_id, gangId))
        )
      ),
    [`gang-battle-sessions-${gangId}`],
    {
      tags: [TAGS.gangBattleSessions(gangId)],
      revalidate: false,
    }
  )();
};

export const getCampaignBattleSessions = (campaignId: string): Promise<BattleSession[]> =>
  listBattleSessions(eq(battleSessions.campaign_id, campaignId));
