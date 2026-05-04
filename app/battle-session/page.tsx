import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/utils/auth';
import { getGangBattleSessionsCached } from '@/app/lib/battle-sessions/get-battle-session-data';
import { getUserGangs } from '@/app/lib/get-user-gangs';
import BattleSessionHub from '@/components/battle-session/battle-session-hub';
import type { BattleSession } from '@/types/battle-session';

export default async function BattleSessionsPage() {
  const supabase = await createClient();

  let user: { id: string };
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    redirect('/sign-in');
  }

  const gangs = await getUserGangs(user.id, supabase);
  const sessionsPerGang = await Promise.all(
    gangs.map((g) => getGangBattleSessionsCached(g.id, supabase))
  );

  const seen = new Set<string>();
  const sessions: BattleSession[] = [];
  for (const gangSessions of sessionsPerGang) {
    for (const s of gangSessions) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        sessions.push(s);
      }
    }
  }
  sessions.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  return <BattleSessionHub sessions={sessions} userId={user.id} />;
}
