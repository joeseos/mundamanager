import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { eq, inArray } from 'drizzle-orm';

import { getAppDb } from '@/utils/db/client';
import { gangs, gangSubtypeTypes } from '@/utils/db/schema';
import { gangPortraitPublicUrl } from '@/types/gang';
import { gangEditionSlug } from '@/types/edition';
import { joinedParentGangTypeName } from '@/utils/gang-type-label';
import { groupBy } from '@/utils/gang-assembly';

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
        },
      });

      if (rows.length === 0) return [];

      const subtypeIds = [...new Set(rows.flatMap((gang) => gang.gang_subtypes ?? []))];
      const [subtypes, campaignGangs] = await Promise.all([
        db
          .select({ id: gangSubtypeTypes.id, subtype: gangSubtypeTypes.subtype })
          .from(gangSubtypeTypes)
          .where(inArray(gangSubtypeTypes.id, subtypeIds)),
        db.query.campaignGangs.findMany({
          columns: { gang_id: true, campaign_id: true },
          where: (campaignGang, { inArray }) => inArray(campaignGang.gang_id, rows.map((gang) => gang.id)),
          with: { campaign: { columns: { campaign_name: true } } },
        }),
      ]);

      const subtypeById = new Map(subtypes.map((subtype) => [subtype.id, subtype]));
      const campaignGangsByGang = groupBy(campaignGangs, 'gang_id');

      return rows.map((gang) => ({
        id: gang.id,
        name: gang.name,
        gang_type: gang.gang_type,
        gang_type_id: gang.gang_type_id,
        image_url: gang.image_url || '',
        gang_portrait_url: gangPortraitPublicUrl(gang.gang_portrait?.storage_path) ?? null,
        credits: gang.credits,
        reputation: gang.reputation,
        rating: gang.rating || 0,
        created_at: gang.created_at,
        last_updated: gang.last_updated,
        gang_subtypes: (gang.gang_subtypes ?? []).flatMap((id) => subtypeById.get(id) ?? []),
        campaigns: (campaignGangsByGang[gang.id] ?? []).map(({ campaign_id, campaign }) => ({
          campaign_id,
          campaign_name: campaign?.campaign_name || 'Unknown Campaign'
        })),
        is_favourite: gang.is_favourite,
        favourite_order: gang.favourite_order,
        edition_slug: gangEditionSlug(gang),
        parent_gang_type_name: joinedParentGangTypeName(gang.gang_types),
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
