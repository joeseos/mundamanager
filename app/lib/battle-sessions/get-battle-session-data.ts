import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';

import type { SupabaseClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { getAppDb } from '@/utils/db/client';
import { battleSessionParticipants } from '@/utils/db/schema';
import { normalizeSessionRecord, type BattleSession, type BattleSessionFull } from '@/types/battle-session';
import { fetchCampaignResources, type CampaignResource } from '@/utils/campaigns/resources';

/** N26: the names of a session's Deployment, Objective and Crew, for display. */
export const SESSION_SCENARIO_PARTS_SELECT =
  'deployment:scenario_table_entries!battle_sessions_deployment_id_fkey ( name ), ' +
  'objective:scenario_table_entries!battle_sessions_objective_id_fkey ( name ), ' +
  'crew_selection:scenario_table_entries!battle_sessions_crew_selection_id_fkey ( name )';

async function fetchBattleSessionDirect(
  sessionId: string,
  supabase: SupabaseClient
): Promise<BattleSessionFull | null> {
  const { data: session, error: sessionError } = await supabase
    .from('battle_sessions')
    .select(`*, editions:edition_id ( slug ), linked_battle:campaign_battle_id ( campaign_territory_id, cycle, note ), ${SESSION_SCENARIO_PARTS_SELECT}`)
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) return null;

  // Flatten the edition slug and drop the embed, mirroring getGangBasic. This has
  // to happen in the loader rather than in the page: the realtime hook refetches
  // through this same function, so a field merged downstream would render once and
  // then disappear on the first refresh.
  const { editions, ...sessionRow } = session;
  const sessionBase = { ...sessionRow, edition_slug: editions?.slug ?? null };

  let campaign_name: string | undefined;
  if (session.campaign_id) {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('campaign_name')
      .eq('id', session.campaign_id)
      .single();
    campaign_name = campaign?.campaign_name;
  }

  const { data: participants } = await supabase
    .from('battle_session_participants')
    .select('*')
    .eq('battle_session_id', sessionId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (!participants || participants.length === 0) {
    return {
      ...sessionBase,
      participants: [],
      campaign_name,
    };
  }

  const gangIds = participants.map((p: any) => p.gang_id);
  const userIds = participants.map((p: any) => p.user_id);

  const [{ data: gangs }, { data: profiles }, campaignResources, { data: campaignGangs }] =
    await Promise.all([
      supabase
        .from('gangs')
        .select('id, name, gang_type_id, gang_colour, rating')
        .in('id', gangIds),
      supabase
        .from('profiles')
        .select('id, username, patreon_tier_id, patreon_tier_title')
        .in('id', userIds),
      session.campaign_id
        ? fetchCampaignResources(session.campaign_id, supabase)
        : Promise.resolve([] as CampaignResource[]),
      session.campaign_id
        ? supabase
            .from('campaign_gangs')
            .select('id, gang_id')
            .eq('campaign_id', session.campaign_id)
            .in('gang_id', gangIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

  const campaignGangIds: Record<string, string> = {};
  for (const cg of campaignGangs || []) {
    campaignGangIds[cg.gang_id] = cg.id;
  }

  const gangMap = new Map(gangs?.map((g: any) => [g.id, g]) || []);
  const profileMap = new Map<string, { id: string; username: string; patreon_tier_id?: string; patreon_tier_title?: string }>(
    profiles?.map((p: any) => [p.id, p]) || []
  );

  const { data: fighters } = await supabase
    .from('battle_session_fighters')
    .select('*')
    .eq('battle_session_id', sessionId);

  // Lightweight fighter enrichment — only fetch name and base credits
  let fighterMap = new Map<string, any>();
  if (fighters && fighters.length > 0) {
    const fighterIds = fighters.map((f: any) => f.fighter_id);
    const { data: fighterDetails } = await supabase
      .from('fighters')
      .select('id, fighter_name, credits, special_rules')
      .in('id', fighterIds);

    fighterMap = new Map(
      (fighterDetails ?? []).map((f: any) => [f.id, f])
    );
  }

  const fightersByParticipant = new Map<string, any[]>();
  for (const f of fighters || []) {
    const list = fightersByParticipant.get(f.participant_id) || [];
    list.push({
      ...f,
      session_record: normalizeSessionRecord(f.session_record),
      fighter: fighterMap.get(f.fighter_id) || undefined,
    });
    fightersByParticipant.set(f.participant_id, list);
  }

  const fullParticipants = participants.map((p: any) => ({
    ...p,
    gang: gangMap.get(p.gang_id) || undefined,
    profile: profileMap.get(p.user_id)
      ? {
          username: profileMap.get(p.user_id)!.username,
          patreon_tier_id: profileMap.get(p.user_id)!.patreon_tier_id,
          patreon_tier_title: profileMap.get(p.user_id)!.patreon_tier_title,
        }
      : undefined,
    fighters: fightersByParticipant.get(p.id) || [],
  }));

  return {
    ...sessionBase,
    participants: fullParticipants,
    campaign_name,
    campaign_resources: campaignResources.length > 0 ? campaignResources : undefined,
    campaign_gang_ids: Object.keys(campaignGangIds).length > 0 ? campaignGangIds : undefined,
  };
}

export { fetchBattleSessionDirect };

// The supabase client is captured in the unstable_cache closure but only
// used on cache miss (first call or after revalidateTag). On cache hits
// the parameter is ignored. Safe here because all participants share the
// same view of the session (no per-user RLS variance).
export const getBattleSessionCached = async (
  sessionId: string,
  supabase: SupabaseClient
): Promise<BattleSessionFull | null> => {
  return unstable_cache(
    () => fetchBattleSessionDirect(sessionId, supabase),
    [`battle-session-${sessionId}`],
    {
      tags: [TAGS.battleSession(sessionId)],
      revalidate: false,
    }
  )();
};

export const getGangBattleSessionsCached = async (gangId: string): Promise<BattleSession[]> => {
  return unstable_cache(
    async () => {
      const db = getAppDb();
      const sessions = await db.query.battleSessions.findMany({
        columns: { created_at: false, updated_at: false },
        // The row's own timestamps would arrive in Postgres's text form; select them
        // as JSON for the ISO form the Data API returned
        extras: (session, { sql }) => ({
          created_at: sql<string>`to_json(${session.created_at})`.as('created_at'),
          updated_at: sql<string>`to_json(${session.updated_at})`.as('updated_at'),
        }),
        where: (session, { inArray }) =>
          inArray(
            session.id,
            db
              .select({ id: battleSessionParticipants.battle_session_id })
              .from(battleSessionParticipants)
              .where(eq(battleSessionParticipants.gang_id, gangId))
          ),
        orderBy: (session, { desc }) => desc(session.updated_at),
        with: {
          editions: { columns: { slug: true } },
          deployment: { columns: { name: true } },
          objective: { columns: { name: true } },
          crew_selection: { columns: { name: true } },
        },
      });

      // Same flatten as fetchBattleSessionDirect. BattleSession declares
      // edition_slug, so a list loader that quietly omitted it would leave the
      // field undefined here and populated there — the kind of inconsistency a
      // future consumer only discovers at runtime.
      return sessions.map(({ editions, ...session }) => ({
        ...session,
        edition_slug: editions?.slug ?? null,
      }));
    },
    [`gang-battle-sessions-${gangId}`],
    {
      tags: [TAGS.gangBattleSessions(gangId)],
      revalidate: false,
    }
  )();
};
