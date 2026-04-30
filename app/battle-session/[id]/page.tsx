import { createClient } from '@/utils/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getAuthenticatedUser } from '@/utils/auth';
import { getBattleSessionCached } from '@/app/lib/battle-sessions/get-battle-session-data';
import ActiveSession from '@/components/battle-session/active-session';
import ConfirmedSession from '@/components/battle-session/confirmed-session';

export default async function BattleSessionPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const supabase = await createClient();

  let user: { id: string };
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    redirect('/sign-in');
  }

  const session = await getBattleSessionCached(params.id, supabase);

  if (!session) {
    notFound();
  }

  if (session.status === 'confirmed') {
    return (
      <main className="flex min-h-screen flex-col items-center">
        <div className="container mx-auto max-w-5xl w-full space-y-4">
          <ConfirmedSession session={session} userId={user.id} />
        </div>
      </main>
    );
  }

  // status === 'active' — fetch additional data needed for editing
  const { data: userGangs } = await supabase
    .from('gangs')
    .select('id, name, rating')
    .eq('user_id', user.id)
    .order('name');

  let campaignGangs: { gang_id: string; user_id: string }[] = [];
  if (session.campaign_id) {
    const { data } = await supabase
      .from('campaign_gangs')
      .select('gang_id, user_id')
      .eq('campaign_id', session.campaign_id);
    campaignGangs = data || [];
  }

  const { data: scenarios } = await supabase
    .from('scenarios')
    .select('id, scenario_name, scenario_number')
    .order('scenario_number');

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-5xl w-full space-y-4">
        <ActiveSession
          session={session}
          userId={user.id}
          userGangs={userGangs || []}
          campaignGangs={campaignGangs}
          scenarios={scenarios || []}
        />
      </div>
    </main>
  );
}
