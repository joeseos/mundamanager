import { createClient } from '@/utils/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getAuthenticatedUser } from '@/utils/auth';
import { getBattleSessionCached } from '@/app/lib/battle-sessions/get-battle-session-data';
import { getGangFightersList, getGangPositioning, type GangFighter } from '@/app/lib/shared/gang-data';
import ActiveSession from '@/components/battle-session/active-session';
import ConfirmedSession from '@/components/battle-session/confirmed-session';

export default async function BattleSessionPage(props: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const params = await props.params;
  const supabase = await createClient();

  let user: { id: string };
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    redirect('/sign-in');
  }

  const session = await getBattleSessionCached(params.sessionId, supabase);

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

  const uniqueGangIds = Array.from(
    new Set(session.participants.map((p) => p.gang_id))
  );

  const [gangFighterLists, gangPositioningList, { data: scenarios }] = await Promise.all([
    Promise.all(uniqueGangIds.map((gId) => getGangFightersList(gId, supabase, { expandLoadoutsForPrint: true }))),
    Promise.all(uniqueGangIds.map((gId) => getGangPositioning(gId, supabase))),
    supabase
      .from('scenarios')
      .select('id, scenario_name, scenario_number')
      .order('scenario_number'),
  ]);

  const gangFightersMap: Record<string, GangFighter[]> = {};
  const gangPositioningMap: Record<string, Record<string, any> | null> = {};
  uniqueGangIds.forEach((gId, i) => {
    gangFightersMap[gId] = gangFighterLists[i];
    gangPositioningMap[gId] = gangPositioningList[i];
  });

  return (
    <main className="flex min-h-screen flex-col items-center">
      <div className="container mx-auto max-w-5xl w-full space-y-4">
        <ActiveSession
          session={session}
          userId={user.id}
          scenarios={scenarios || []}
          gangFightersMap={gangFightersMap}
          gangPositioningMap={gangPositioningMap}
        />
      </div>
    </main>
  );
}
