import {
  getGangCore,
  getGangFightersList,
  getGangPositioning,
  getGangStash,
  getGangSubtypes
} from "@/app/lib/shared/gang-data";
import type { GangFighter } from "@/types/gang";
import { sortFightersByPositioning } from "@/utils/fighter-positioning";
import { publicDataOptions, publicDataResponse, transformFighterSummaryForData } from "@/utils/public-data-response";

export const OPTIONS = publicDataOptions;

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
      getGangFightersList(gangId, {
        gangEditionSlug: gang.edition_slug ?? null,
        gangTypeId: gang.gang_type_id,
        gangOriginId: gang.gang_origin_id ?? null,
        gangSubtypeIds: gang.gang_subtypes ?? []
      }),
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
