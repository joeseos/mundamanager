import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { eq, inArray } from 'drizzle-orm';

import { getAppDb, type AppDb } from '@/utils/db/client';
import { gangs, gangSubtypeTypes } from '@/utils/db/schema';
import { gangPortraitPublicUrl } from '@/types/gang';
import { gangEditionSlug } from '@/types/edition';
import { joinedParentGangTypeName } from '@/utils/gang-type-label';

export type Gang = {
  id: string;
  name: string | null;
  gang_type: string | null;
  gang_type_id: string | null;
  image_url: string;
  gang_portrait_url?: string | null;
  credits: number | null;
  reputation: number | null;
  rating: number;
  created_at: string;
  last_updated: string | null;
  gang_subtypes: Array<{id: string, subtype: string | null}>;
  campaigns: Array<{campaign_id: string | null, campaign_name: string}>;
  is_favourite: boolean;
  favourite_order: number | null;
  /** Derived from official or custom gang type; null treated as n23 by home filters. */
  edition_slug: string | null;
  /** House of an alternate gang list. Null for root and custom gangs. */
  parent_gang_type_name?: string | null;
};

/** What a gang card shows; shared by the home Gangs tab and Browse Gangs. */
export type GangCard = Pick<
  Gang,
  'id' | 'name' | 'gang_type' | 'parent_gang_type_name' | 'gang_subtypes' | 'rating' | 'image_url' | 'gang_portrait_url'
>;

type GangCardRow = {
  id: string;
  name: string | null;
  gang_type: string | null;
  image_url: string | null;
  rating: number | null;
  gang_subtypes: string[] | null;
  gang_portrait: { storage_path: string } | null;
  gang_types: { parent_gang_type_name: string | null } | null;
};

/** A gang row as a card, with its subtype ids resolved to names. */
export function toGangCard(
  gang: GangCardRow,
  subtypeById: Map<string, { id: string; subtype: string | null }>
): GangCard {
  return {
    id: gang.id,
    name: gang.name,
    gang_type: gang.gang_type,
    parent_gang_type_name: joinedParentGangTypeName(gang.gang_types),
    gang_subtypes: (gang.gang_subtypes ?? []).flatMap((id) => subtypeById.get(id) ?? []),
    rating: gang.rating || 0,
    image_url: gang.image_url || '',
    gang_portrait_url: gangPortraitPublicUrl(gang.gang_portrait?.storage_path) ?? null,
  };
}

/** Subtype names for the ids stored on the gangs' gang_subtypes, keyed by id. */
export async function getGangSubtypesById(
  db: AppDb,
  rows: { gang_subtypes: string[] | null }[]
): Promise<Map<string, { id: string; subtype: string | null }>> {
  const subtypeIds = [...new Set(rows.flatMap((gang) => gang.gang_subtypes ?? []))];
  const subtypes = subtypeIds.length > 0
    ? await db
        .select({ id: gangSubtypeTypes.id, subtype: gangSubtypeTypes.subtype })
        .from(gangSubtypeTypes)
        .where(inArray(gangSubtypeTypes.id, subtypeIds))
    : [];
  return new Map(subtypes.map((subtype) => [subtype.id, subtype]));
}

/**
 * Cached list of the user's gang ids, so the list entry below can carry
 * per-gang tags (dynamic tags must be known before the cached call).
 * Busted via user-{id} whenever the list shape changes (create/delete/copy).
 */
const getUserGangIdsCached = async (userId: string): Promise<string[]> => {
  return unstable_cache(
    async () => {
      const rows = await getAppDb()
        .select({ id: gangs.id })
        .from(gangs)
        .where(eq(gangs.user_id, userId));
      return rows.map((gang) => gang.id);
    },
    [`user-gang-ids-v4-${userId}`],
    {
      tags: [TAGS.user(userId)],
      revalidate: false
    }
  )();
};

export const getUserGangs = async (userId: string): Promise<Gang[]> => {
  const gangIdsForTags = await getUserGangIdsCached(userId);

  return unstable_cache(
    async () => {
      const db = getAppDb();
      const rows = await db.query.gangs.findMany({
        columns: {
          id: true,
          name: true,
          gang_type: true,
          gang_type_id: true,
          image_url: true,
          credits: true,
          reputation: true,
          rating: true,
          gang_subtypes: true,
          is_favourite: true,
          favourite_order: true,
        },
        extras: (gang, { sql }) => ({
          created_at: sql<string>`to_json(${gang.created_at})`.as('created_at'),
          last_updated: sql<string | null>`to_json(${gang.last_updated})`.as('last_updated'),
        }),
        where: (gang, { eq }) => eq(gang.user_id, userId),
        orderBy: (gang, { desc }) => desc(gang.created_at),
        with: {
          gang_portrait: { columns: { storage_path: true } },
          gang_types: {
            columns: { parent_gang_type_name: true },
            with: { editions: { columns: { slug: true } } },
          },
          custom_gang_type: { columns: {}, with: { editions: { columns: { slug: true } } } },
          campaign_gangs: {
            columns: { campaign_id: true },
            with: { campaign: { columns: { campaign_name: true } } },
          },
        },
      });

      const subtypeById = await getGangSubtypesById(db, rows);

      return rows.map((gang) => ({
        ...toGangCard(gang, subtypeById),
        gang_type_id: gang.gang_type_id,
        credits: gang.credits,
        reputation: gang.reputation,
        created_at: gang.created_at,
        last_updated: gang.last_updated,
        campaigns: gang.campaign_gangs.map(({ campaign_id, campaign }) => ({
          campaign_id,
          campaign_name: campaign?.campaign_name || 'Unknown Campaign'
        })),
        is_favourite: gang.is_favourite,
        favourite_order: gang.favourite_order,
        edition_slug: gangEditionSlug(gang),
      }));
    },
    [`user-gangs-v9-${userId}`],
    {
      tags: [
        // List shape (create/delete/copy gang, favourites)
        TAGS.user(userId),
        // Catalog portraits/names joined from gang_types (admin gang-type writes)
        TAGS.globalGangTypes(),
        // Catalogue file paths joined from gang_portraits
        TAGS.globalGangPortraits(),
        // Card fields: rating/credits/name via the financials choke point
        ...gangIdsForTags.map(id => TAGS.gangOverview(id)),
        // Campaign names on cards: join/leave (previously never invalidated)
        ...gangIdsForTags.map(id => TAGS.gangCampaigns(id))
      ],
      revalidate: false
    }
  )();
};
