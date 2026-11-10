import { getCampaignBasic, getCampaignMembers } from "@/app/lib/campaigns/[id]/get-campaign-data";
import { getGangCore, getGangFightersBundle, getGangPositioning } from "@/app/lib/shared/gang-data";
import { sortFightersByPositioning } from "@/utils/fighter-positioning";
import { campaignDataOptions, campaignDataResponse } from "../campaign-data-response";

export const OPTIONS = campaignDataOptions;

interface DataFighter {
  gang_id: string;
  gang_name: string;
  id: string;
  name: string;
  type: string;
  subtypes: string[];
  xp: number;
  is_vehicle: boolean;
  killed: boolean;
  retired: boolean;
  enslaved: boolean;
  recovery: boolean;
  captured: boolean;
  starved: boolean;
}

/**
 * Transform a fighter row from the gang fighters bundle for data endpoint
 */
function transformFighterForData(fighter: any, gang: { id: string; name: string }): DataFighter {
  return {
    gang_id: gang.id,
    gang_name: gang.name,
    id: fighter.id,
    name: fighter.fighter_name ?? '',
    type: fighter.fighter_type || fighter.fighter_types?.fighter_type || 'Unknown',
    subtypes: fighter.fighter_subtypes ?? [],
    xp: fighter.xp ?? 0,
    is_vehicle: fighter.is_vehicle ?? false,
    killed: fighter.killed ?? false,
    retired: fighter.retired ?? false,
    enslaved: fighter.enslaved ?? false,
    recovery: fighter.recovery ?? false,
    captured: fighter.captured ?? false,
    starved: fighter.starved ?? false
  };
}

/**
 * A gang's fighters in its saved display order, read from the gang page's
 * existing caches. Hidden gangs publish no roster.
 */
async function getGangDataFighters(gang: { id: string; name: string }): Promise<DataFighter[]> {
  const gangCore = await getGangCore(gang.id);
  if (!gangCore || gangCore.hidden) return [];

  const [bundle, positioning] = await Promise.all([
    getGangFightersBundle(gang.id),
    getGangPositioning(gang.id)
  ]);

  // Alphabetical without a saved order matches initializePositioningIfNeeded
  // without writing during a public read; it also orders unpositioned fighters
  const byName = (a: any, b: any) => (a.fighter_name ?? '').localeCompare(b.fighter_name ?? '');
  const fighters = sortFightersByPositioning(bundle.fighters, positioning, byName);

  return fighters.map(fighter => transformFighterForData(fighter, gang));
}

/**
 * Fighter rosters of a campaign's accepted gangs, or of one gang with ?gang_id=
 */
export async function GET(request: Request, props: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await props.params;
  const gangId = new URL(request.url).searchParams.get('gang_id')?.toLowerCase();

  return campaignDataResponse(request, campaignId, async () => {
    const [campaignBasic, campaignMembers] = await Promise.all([
      getCampaignBasic(campaignId),
      getCampaignMembers(campaignId)
    ]);

    if (!campaignBasic) return null;

    // Only ACCEPTED gangs publish a roster; an invitation alone must not.
    // A blank ?gang_id= matches no gang rather than every gang.
    const gangs = campaignMembers
      .flatMap(member => member.gangs)
      .filter(gang => gang.status === 'ACCEPTED' && gang.id && (gangId === undefined || gang.id === gangId));
    const uniqueGangs = new Map(gangs.map(gang => [gang.id, { id: gang.id, name: gang.name }]));

    const rosters = await Promise.all([...uniqueGangs.values()].map(getGangDataFighters));

    return {
      campaign_id: campaignBasic.id,
      fighters: rosters.flat()
    };
  }, 'fighter_data', `campaign_${campaignId}_fighters.xml`);
}
