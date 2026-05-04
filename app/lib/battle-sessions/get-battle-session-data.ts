import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { getFighterTotalCost } from '@/app/lib/shared/fighter-data';
import type { BattleSession, BattleSessionFull } from '@/types/battle-session';

export const getBattleSessionCached = async (
  sessionId: string,
  supabase: any
): Promise<BattleSessionFull | null> => {
  return unstable_cache(
    async () => {
      const { data: session, error: sessionError } = await supabase
        .from('battle_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionError || !session) return null;

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
        .eq('battle_session_id', sessionId);

      if (!participants || participants.length === 0) {
        return {
          ...session,
          participants: [],
          campaign_name,
        };
      }

      const gangIds = participants.map((p: any) => p.gang_id);
      const userIds = participants.map((p: any) => p.user_id);

      const [{ data: gangs }, { data: profiles }] = await Promise.all([
        supabase
          .from('gangs')
          .select('id, name, gang_colour, rating')
          .in('id', gangIds),
        supabase
          .from('profiles')
          .select('id, username')
          .in('id', userIds),
      ]);

      const gangMap = new Map(gangs?.map((g: any) => [g.id, g]) || []);
      const profileMap = new Map<string, { id: string; username: string }>(
        profiles?.map((p: any) => [p.id, p]) || []
      );

      const { data: fighters } = await supabase
        .from('battle_session_fighters')
        .select('*')
        .eq('battle_session_id', sessionId);

      let fighterMap = new Map<string, any>();
      if (fighters && fighters.length > 0) {
        const fighterIds = fighters.map((f: any) => f.fighter_id);
        const { data: fighterDetails } = await supabase
          .from('fighters')
          .select('id, fighter_name, credits')
          .in('id', fighterIds);

        const enriched = await Promise.all(
          (fighterDetails ?? []).map(async (f: any) => ({
            ...f,
            total_cost: await getFighterTotalCost(f.id, supabase),
          }))
        );
        fighterMap = new Map(enriched.map((f: any) => [f.id, f]));
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
          },
          fighter: fighterMap.get(f.fighter_id) || undefined,
        });
        fightersByParticipant.set(f.participant_id, list);
      }

      const fullParticipants = participants.map((p: any) => ({
        ...p,
        gang: gangMap.get(p.gang_id) || undefined,
        profile: profileMap.get(p.user_id)
          ? { username: profileMap.get(p.user_id)!.username }
          : undefined,
        fighters: fightersByParticipant.get(p.id) || [],
      }));

      return {
        ...session,
        participants: fullParticipants,
        campaign_name,
      };
    },
    [`battle-session-${sessionId}`],
    {
      tags: [CACHE_TAGS.BASE_BATTLE_SESSION(sessionId)],
      revalidate: false,
    }
  )();
};

export const getGangBattleSessionsCached = async (
  gangId: string,
  supabase: any
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

      const { data: sessions } = await supabase
        .from('battle_sessions')
        .select('*')
        .in('id', sessionIds)
        .order('updated_at', { ascending: false });

      return sessions || [];
    },
    [`gang-battle-sessions-${gangId}`],
    {
      tags: [CACHE_TAGS.GANG_BATTLE_SESSIONS(gangId)],
      revalidate: false,
    }
  )();
};
