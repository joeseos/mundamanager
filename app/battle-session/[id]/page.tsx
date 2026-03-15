import { createClient } from '@/utils/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getAuthenticatedUser } from '@/utils/auth';
import { getBattleSession } from '@/app/actions/battle-sessions';
import BattleSessionClient from '@/components/battle-session/battle-session-client';

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

  const session = await getBattleSession(params.id);

  if (!session) {
    notFound();
  }

  // Fetch user's gangs for adding to session
  const { data: userGangs } = await supabase
    .from('gangs')
    .select('id, name, rating')
    .eq('user_id', user.id)
    .order('name');

  // If campaign session, fetch campaign gangs for scoping
  let campaignGangs: { gang_id: string; user_id: string }[] = [];
  if (session.campaign_id) {
    const { data } = await supabase
      .from('campaign_gangs')
      .select('gang_id, user_id')
      .eq('campaign_id', session.campaign_id);
    campaignGangs = data || [];
  }

  // Fetch scenarios for the scenario picker
  const { data: scenarios } = await supabase
    .from('scenarios')
    .select('id, scenario_name, scenario_number')
    .order('scenario_number');

  return (
    <BattleSessionClient
      initialSession={session}
      userId={user.id}
      userGangs={userGangs || []}
      campaignGangs={campaignGangs}
      scenarios={scenarios || []}
    />
  );
}
