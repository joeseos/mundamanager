import {
  getGangCore,
  getGangFightersList,
  getGangPositioning,
  getGangStash,
  getGangSubtypes
} from "@/app/lib/shared/gang-data";
import type { GangFighter } from "@/types/gang";
import { sortFightersByPositioning } from "@/utils/fighter-positioning";
import { publicDataOptions, publicDataResponse } from "@/utils/public-data-response";

export const OPTIONS = publicDataOptions;

interface DataFighterSummary {
  id: string;
  name: string;
  type: string;
  subtypes: string[];
  cost: number;
  xp: number;
  kills: number;
  is_vehicle: boolean;
  killed: boolean;
  retired: boolean;
  enslaved: boolean;
  recovery: boolean;
  captured: boolean;
  starved: boolean;
}

/**
 * Transform an assembled gang page fighter into its roster summary for data endpoint
 */
function transformFighterSummaryForData(fighter: GangFighter): DataFighterSummary {
  return {
    id: fighter.id,
    name: fighter.fighter_name ?? '',
    type: fighter.fighter_type,
    subtypes: fighter.fighter_subtypes ?? [],
    cost: fighter.credits,
    xp: fighter.xp ?? 0,
    kills: fighter.kills,
    is_vehicle: fighter.is_vehicle ?? false,
    killed: fighter.killed,
    retired: fighter.retired,
    enslaved: fighter.enslaved,
    recovery: fighter.recovery,
    captured: fighter.captured,
    starved: fighter.starved
  };
}

/**
 * A gang's details, fighter roster and stash, read from the gang page's caches.
 * Hidden gangs are not published.
 */
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  return publicDataResponse(request, params.id, 'Gang', async (gangId) => {
    const gang = await getGangCore(gangId);
    if (!gang || gang.hidden) return null;

    const [fighters, positioning, stash, subtypes] = await Promise.all([
      getGangFightersList(gangId),
      getGangPositioning(gangId),
      getGangStash(gangId),
      getGangSubtypes(gang.gang_subtypes ?? [])
    ]);

    // Alphabetical without a saved order matches initializePositioningIfNeeded
    // without writing during a public read; it also orders unpositioned fighters
    const byName = (a: GangFighter, b: GangFighter) => (a.fighter_name ?? '').localeCompare(b.fighter_name ?? '');

    return {
      gang: {
        id: gang.id,
        name: gang.name,
        type: gang.gang_type,
        subtypes: subtypes.map(subtype => subtype.subtype),
        colour: gang.gang_colour,
        alignment: gang.alignment ?? null,
        affiliation: gang.gang_affiliation?.name ?? null,
        origin: gang.gang_origin?.origin_name ?? null,
        alliance: gang.alliance?.alliance_name ?? null,
        rating: gang.rating,
        wealth: gang.wealth,
        credits: gang.credits,
        reputation: gang.reputation,
        note: gang.note ?? null,
        backstory: gang.note_backstory ?? null,
        image_url: gang.gang_portrait_url ?? gang.image_url ?? null,
        created_at: gang.created_at,
        updated_at: gang.last_updated ?? null
      },
      fighters: sortFightersByPositioning(fighters, positioning, byName).map(transformFighterSummaryForData),
      stash_items: stash.map(item => ({
        id: item.id,
        name: item.equipment_name,
        type: item.equipment_type,
        category: item.equipment_category,
        cost: item.cost
      }))
    };
  });
}
