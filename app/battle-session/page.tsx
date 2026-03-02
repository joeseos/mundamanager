import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser } from '@/utils/auth';
import { getUserBattleSessions } from '@/app/actions/battle-sessions';
import BattleSessionHub from '@/components/battle-session/battle-session-hub';

export default async function BattleSessionsPage() {
  const supabase = await createClient();

  let user: { id: string };
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    redirect('/sign-in');
  }

  const sessions = await getUserBattleSessions();

  return <BattleSessionHub sessions={sessions} userId={user.id} />;
}
