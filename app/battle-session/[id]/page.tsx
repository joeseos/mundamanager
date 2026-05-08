import { createClient } from '@/utils/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getAuthenticatedUser } from '@/utils/auth';
import { getBattleSessionCached } from '@/app/lib/battle-sessions/get-battle-session-data';
import { getGangFightersList, type GangFighter } from '@/app/lib/shared/gang-data';
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
  const uniqueGangIds = Array.from(
    new Set(session.participants.map((p) => p.gang_id))
  );

  const [{ data: userGangs }, gangFighterLists, { data: scenarios }, campaignGangs] =
    await Promise.all([
      supabase
        .from('gangs')
        .select('id, name, rating')
        .eq('user_id', user.id)
        .order('name'),
      Promise.all(uniqueGangIds.map((gId) => getGangFightersList(gId, supabase))),
      supabase
        .from('scenarios')
        .select('id, scenario_name, scenario_number')
        .order('scenario_number'),
      session.campaign_id
        ? supabase
            .from('campaign_gangs')
            .select('gang_id, user_id')
            .eq('campaign_id', session.campaign_id)
            .then(({ data }) => data || [])
        : Promise.resolve([]),
    ]);

  const gangFightersMap: Record<string, GangFighter[]> = {};
  uniqueGangIds.forEach((gId, i) => {
    gangFightersMap[gId] = gangFighterLists[i];
  });

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-5xl w-full space-y-4">
        <ActiveSession
          session={session}
          userId={user.id}
          userGangs={userGangs || []}
          campaignGangs={campaignGangs}
          scenarios={scenarios || []}
          gangFightersMap={gangFightersMap}
        />
      </div>
    </main>
  );
}
