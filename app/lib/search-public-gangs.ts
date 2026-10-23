import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

import { TAGS } from '@/utils/cache-tags';

import { getAppDb } from '@/utils/db/client';
import { editions, gangSubtypeTypes, gangTypes } from '@/utils/db/schema';
import { gangPortraitPublicUrl } from '@/types/gang';
import { EDITION_N23, EDITION_N26, type EditionSlug } from '@/types/edition';
import { detailGangTypeLabel, joinedParentGangTypeName } from '@/utils/gang-type-label';
import { isUuid } from '@/utils/uuid';
import { getGangSubtypesById, type Gang } from '@/app/lib/get-user-gangs';

export const PUBLIC_GANGS_PAGE_SIZE = 50;

export interface PublicGangFilters {
  edition: EditionSlug;
  userId: string | null;
  gangTypeId: string | null;
  subtypeId: string | null;
  minRating: number | null;
  maxRating: number | null;
  page: number;
}

export type PublicGang = Pick<
  Gang,
  'id' | 'name' | 'gang_type' | 'parent_gang_type_name' | 'gang_subtypes' | 'rating' | 'image_url' | 'gang_portrait_url'
>;

export interface PublicGangFilterOption {
  value: string;
  label: string;
}

type SearchParams = Record<string, string | string[] | undefined>;

const firstParam = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const ratingParam = (value: string | string[] | undefined): number | null => {
  const rating = Number(firstParam(value));
  return firstParam(value) && Number.isFinite(rating) ? rating : null;
};

/** Filters from the /gangs query string; anything malformed is dropped. */
export function parsePublicGangFilters(searchParams: SearchParams): PublicGangFilters {
  const edition = firstParam(searchParams.edition) === EDITION_N23 ? EDITION_N23 : EDITION_N26;
  const userId = firstParam(searchParams.user);
  const gangTypeId = firstParam(searchParams.type);
  const subtypeId = firstParam(searchParams.subtype);
  const page = Number(firstParam(searchParams.page));

  return {
    edition,
    userId: isUuid(userId) ? userId : null,
    gangTypeId: isUuid(gangTypeId) ? gangTypeId : null,
    subtypeId: isUuid(subtypeId) ? subtypeId : null,
    minRating: ratingParam(searchParams.minRating),
    maxRating: ratingParam(searchParams.maxRating),
    page: Number.isSafeInteger(page) && page > 1 ? page : 1,
  };
}

/** Gang type and subtype choices for the edition's filters. */
export const getPublicGangFilterOptions = (edition: EditionSlug): Promise<{
  gangTypes: PublicGangFilterOption[];
  subtypes: PublicGangFilterOption[];
}> => unstable_cache(
  async () => {
    const db = getAppDb();
    const [types, subtypes] = await Promise.all([
      db
        .select({ id: gangTypes.id, gang_type: gangTypes.gang_type, parent_gang_type_name: gangTypes.parent_gang_type_name })
        .from(gangTypes)
        .innerJoin(editions, eq(editions.id, gangTypes.edition_id))
        .where(and(eq(editions.slug, edition), eq(gangTypes.is_hidden, false))),
      db
        .select({ id: gangSubtypeTypes.id, subtype: gangSubtypeTypes.subtype })
        .from(gangSubtypeTypes)
        .innerJoin(editions, eq(editions.id, gangSubtypeTypes.edition_id))
        .where(eq(editions.slug, edition))
        .orderBy(asc(gangSubtypeTypes.subtype)),
    ]);

    return {
      gangTypes: types
        .map((type) => ({ value: type.id, label: detailGangTypeLabel(type.gang_type, type.parent_gang_type_name) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      subtypes: subtypes.map((subtype) => ({ value: subtype.id, label: subtype.subtype ?? '' })),
    };
  },
  [`public-gang-filter-options-${edition}`],
  {
    tags: [TAGS.globalGangTypes()],
    revalidate: 3600 // Subtypes have no tag of their own and rarely change
  }
)();

/**
 * One page of gangs that aren't hidden, most recently updated first. Custom
 * gang types are left out. Read over the direct connection, so the page
 * authenticates the request before calling this.
 */
export async function searchPublicGangs(filters: PublicGangFilters): Promise<{
  gangs: PublicGang[];
  hasMore: boolean;
}> {
  const db = getAppDb();
  const rows = await db.query.gangs.findMany({
    columns: {
      id: true,
      name: true,
      gang_type: true,
      image_url: true,
      rating: true,
      gang_subtypes: true,
    },
    where: (gang) => and(
      eq(gang.hidden, false),
      isNull(gang.custom_gang_type_id),
      // A gang's edition is its gang type's
      inArray(
        gang.gang_type_id,
        db.select({ id: gangTypes.id })
          .from(gangTypes)
          .innerJoin(editions, eq(editions.id, gangTypes.edition_id))
          .where(eq(editions.slug, filters.edition))
      ),
      filters.userId ? eq(gang.user_id, filters.userId) : undefined,
      filters.gangTypeId ? eq(gang.gang_type_id, filters.gangTypeId) : undefined,
      filters.subtypeId ? sql`${gang.gang_subtypes} @> ${JSON.stringify([filters.subtypeId])}::jsonb` : undefined,
      filters.minRating !== null ? gte(gang.rating, filters.minRating) : undefined,
      filters.maxRating !== null ? lte(gang.rating, filters.maxRating) : undefined,
    ),
    // id breaks ties, so paging doesn't repeat or skip gangs updated at the same time
    orderBy: (gang) => [sql`${gang.last_updated} desc nulls last`, desc(gang.id)],
    // One extra row tells whether there is a next page
    limit: PUBLIC_GANGS_PAGE_SIZE + 1,
    offset: (filters.page - 1) * PUBLIC_GANGS_PAGE_SIZE,
    with: {
      gang_portrait: { columns: { storage_path: true } },
      gang_types: { columns: { parent_gang_type_name: true } },
    },
  });

  const pageRows = rows.slice(0, PUBLIC_GANGS_PAGE_SIZE);
  const subtypeById = await getGangSubtypesById(db, pageRows);

  return {
    gangs: pageRows.map((gang) => ({
      id: gang.id,
      name: gang.name,
      gang_type: gang.gang_type,
      parent_gang_type_name: joinedParentGangTypeName(gang.gang_types),
      gang_subtypes: (gang.gang_subtypes ?? []).flatMap((id) => subtypeById.get(id) ?? []),
      rating: gang.rating || 0,
      image_url: gang.image_url || '',
      gang_portrait_url: gangPortraitPublicUrl(gang.gang_portrait?.storage_path) ?? null,
    })),
    hasMore: rows.length > PUBLIC_GANGS_PAGE_SIZE,
  };
}
