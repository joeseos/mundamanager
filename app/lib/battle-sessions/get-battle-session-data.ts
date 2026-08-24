import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BattleSession, BattleSessionFull } from '@/types/battle-session';
import { fetchCampaignResources, type CampaignResource } from '@/utils/campaigns/resources';

async function fetchBattleSessionDirect(
  sessionId: string,
  supabase: SupabaseClient
): Promise<BattleSessionFull | null> {
  const { data: session, error: sessionError } = await supabase
    .from('battle_sessions')
    .select('*, editions:edition_id ( slug )')
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
        .select('id, name, gang_colour, rating')
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
      session_record: {
        xp_earned: f.session_record?.xp_earned ?? 0,
        injuries: f.session_record?.injuries ?? [],
        conditions: f.session_record?.conditions ?? [],
        note: f.session_record?.note,
        activations: f.session_record?.activations ?? 1,
      },
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

export const getGangBattleSessionsCached = async (
  gangId: string,
  supabase: SupabaseClient
): Promise<BattleSession[]> => {
  return unstable_cache(
    async () => {
      const { data: participantSessions } = await supabase
        .from('battle_session_participants')
        .select('battle_session_id')
        .eq('gang_id', gangId);

      const sessionIds = Array.from(
        new Set((participantSessions || []).map((p: any) => p.battle_session_id))
      ) as string[];

      if (sessionIds.length === 0) return [];

      // Same embed + flatten as fetchBattleSessionDirect. BattleSession declares
      // edition_slug, so a list loader that quietly omitted it would leave the
      // field undefined here and populated there — the kind of inconsistency a
      // future consumer only discovers at runtime.
      const { data: sessions } = await supabase
        .from('battle_sessions')
        .select('*, editions:edition_id ( slug )')
        .in('id', sessionIds)
        .order('updated_at', { ascending: false });

      return (sessions || []).map(({ editions, ...session }: any) => ({
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
