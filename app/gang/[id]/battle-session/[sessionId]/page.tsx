import { createClient } from '@/utils/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getAuthenticatedUser, signInPath } from '@/utils/auth';
import { getBattleSessionCached } from '@/app/lib/battle-sessions/get-battle-session-data';
import { getGangFightersList, getGangPositioning, type GangFighter } from '@/app/lib/shared/gang-data';
import { getCampaignTerritories } from '@/app/lib/campaigns/[id]/get-campaign-data';
import { checkCampaignArbitrator } from '@/utils/user-permissions';
import { sortFightersByPositioning } from '@/utils/fighter-positioning';
import ActiveSession from '@/components/battle-session/active-session';
import CompletedSession from '@/components/battle-session/completed-session';

export async function renderBattleSessionPage(sessionId: string, currentPath: string) {
  const supabase = await createClient();

  let user: { id: string };
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    redirect(signInPath(currentPath));
  }

  const session = await getBattleSessionCached(sessionId, supabase);

  if (!session) {
    notFound();
  }

  if (session.status === 'completed') {
    return (
      <div className="space-y-4">
        <CompletedSession session={session} userId={user.id} />
      </div>
    );
  }

  // Site admins and campaign OWNERs/ARBITRATORs can manage the session like
  // the creator and edit participants like the gang owners (gang page model)
  const isArb = await checkCampaignArbitrator(
    user.id,
    session.campaign_id
  );

  const uniqueGangIds = Array.from(
    new Set(session.participants.map((p) => p.gang_id))
  );

  const [gangFighterLists, gangPositioningList, { data: scenarios }, campaignTerritories] = await Promise.all([
    Promise.all(uniqueGangIds.map((gId) => getGangFightersList(gId, supabase, { expandLoadoutsForPrint: true }))),
    Promise.all(uniqueGangIds.map((gId) => getGangPositioning(gId, supabase))),
    supabase
      .from('scenarios')
      .select('id, scenario_name, scenario_number')
      .order('scenario_number'),
    session.campaign_id ? getCampaignTerritories(session.campaign_id, supabase) : Promise.resolve([]),
  ]);

  const gangFightersMap: Record<string, GangFighter[]> = {};
  const gangPositioningMap: Record<string, Record<string, any> | null> = {};
  uniqueGangIds.forEach((gId, i) => {
    const fighters = gangFighterLists[i];
    const positioning = gangPositioningList[i];
    gangFightersMap[gId] = sortFightersByPositioning(fighters, positioning);
    gangPositioningMap[gId] = positioning;
  });

  return (
    <div className="space-y-4">
      <ActiveSession
        session={session}
        userId={user.id}
        isArbitrator={isArb}
        scenarios={scenarios || []}
        gangFightersMap={gangFightersMap}
        gangPositioningMap={gangPositioningMap}
        territories={(campaignTerritories || []).map((t: any) => ({
          id: t.id,
          name: t.territory_name,
          controlled_by: t.gang_id || undefined,
          default_gang_territory: t.default_gang_territory,
        }))}
      />
    </div>
  );
}

export default async function BattleSessionPage(props: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const params = await props.params;
  return renderBattleSessionPage(params.sessionId, `/gang/${params.id}/battle-session/${params.sessionId}`);
}
