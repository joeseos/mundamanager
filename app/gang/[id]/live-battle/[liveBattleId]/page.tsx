import { createClient } from '@/utils/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getAuthenticatedUser, signInPath } from '@/utils/auth';
import { getLiveBattleCached } from '@/app/lib/live-battles/get-live-battle-data';
import { getGangFightersList, getGangPositioning } from '@/app/lib/shared/gang-data';
import type { GangFighter } from '@/types/gang';
import { getCampaignTerritories } from '@/app/lib/campaigns/[id]/get-campaign-data';
import { getScenariosCached, getScenarioTablesCached } from '@/app/lib/reference-data';
import { checkCampaignArbitrator } from '@/utils/user-permissions';
import { sortFightersByPositioning } from '@/utils/fighter-positioning';
import ActiveLiveBattle from '@/components/live-battle/active-live-battle';
import CompletedLiveBattle from '@/components/live-battle/completed-live-battle';

export async function renderLiveBattlePage(liveBattleId: string, currentPath: string) {
  const supabase = await createClient();

  let user: { id: string };
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    redirect(signInPath(currentPath));
  }

  const liveBattle = await getLiveBattleCached(liveBattleId);

  if (!liveBattle) {
    notFound();
  }

  if (liveBattle.status === 'completed') {
    return (
      <div className="space-y-4">
        <CompletedLiveBattle liveBattle={liveBattle} userId={user.id} />
      </div>
    );
  }

  // Site admins and campaign OWNERs/ARBITRATORs can manage the live battle like
  // the creator and edit participants like the gang owners (gang page model)
  const isArb = await checkCampaignArbitrator(
    user.id,
    liveBattle.campaign_id
  );

  const uniqueGangIds = Array.from(
    new Set(liveBattle.participants.map((p) => p.gang_id))
  );

  const [gangFighterLists, gangPositioningList, scenarios, scenarioTables, campaignTerritories] = await Promise.all([
    Promise.all(uniqueGangIds.map((gId) => getGangFightersList(gId, { expandLoadoutsForPrint: true }))),
    Promise.all(uniqueGangIds.map((gId) => getGangPositioning(gId))),
    getScenariosCached(),
    getScenarioTablesCached(),
    liveBattle.campaign_id ? getCampaignTerritories(liveBattle.campaign_id) : Promise.resolve([]),
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
      <ActiveLiveBattle
        liveBattle={liveBattle}
        userId={user.id}
        isArbitrator={isArb}
        scenarios={scenarios || []}
        scenarioTables={scenarioTables.filter((table) => table.edition_slug === liveBattle.edition_slug)}
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

export default async function LiveBattlePage(props: {
  params: Promise<{ id: string; liveBattleId: string }>;
}) {
  const params = await props.params;
  return renderLiveBattlePage(params.liveBattleId, `/gang/${params.id}/live-battle/${params.liveBattleId}`);
}
