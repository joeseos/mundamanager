import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

import { TAGS } from '@/utils/cache-tags';
import { getAppDb } from '@/utils/db/client';
import { editions, gangs, gangSubtypeTypes, gangTypes } from '@/utils/db/schema';
import type { EditionSlug } from '@/types/edition';
import { detailGangTypeLabel } from '@/utils/gang-type-label';
import { PUBLIC_GANGS_PAGE_SIZE, type PublicGangFilters } from '@/utils/browse-gangs-filters';
import { getGangSubtypesById, toGangCard, type GangCard } from '@/app/lib/get-user-gangs';

export interface PublicGangFilterOption {
  value: string;
  label: string;
}

/** Ids of the edition's gang types that Browse Gangs lists; hidden types are left out. */
const browsableGangTypeIds = (edition: EditionSlug) =>
  getAppDb()
    .select({ id: gangTypes.id })
    .from(gangTypes)
    .innerJoin(editions, eq(editions.id, gangTypes.edition_id))
    .where(and(eq(editions.slug, edition), eq(gangTypes.is_hidden, false)));

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
        .where(inArray(gangTypes.id, browsableGangTypeIds(edition))),
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
 * and hidden gang types are left out. Read over the direct connection, so the page
 * authenticates the request before calling this.
 */
export async function searchPublicGangs(filters: PublicGangFilters): Promise<{
  gangs: GangCard[];
  total: number;
}> {
  const db = getAppDb();
  const where = and(
    eq(gangs.hidden, false),
    isNull(gangs.custom_gang_type_id),
    // A gang's edition is its gang type's
    inArray(gangs.gang_type_id, browsableGangTypeIds(filters.edition)),
    filters.userId ? eq(gangs.user_id, filters.userId) : undefined,
    filters.gangTypeId ? eq(gangs.gang_type_id, filters.gangTypeId) : undefined,
    filters.subtypeId ? sql`${gangs.gang_subtypes} @> ${JSON.stringify([filters.subtypeId])}::jsonb` : undefined,
    // A gang with no rating yet shows as 0, so it is filtered as 0
    filters.minRating !== null ? gte(sql`coalesce(${gangs.rating}, 0)`, filters.minRating) : undefined,
    filters.maxRating !== null ? lte(sql`coalesce(${gangs.rating}, 0)`, filters.maxRating) : undefined,
  );

  const [pageRows, total] = await Promise.all([
    db.query.gangs.findMany({
      columns: {
        id: true,
        name: true,
        gang_type: true,
        image_url: true,
        rating: true,
        gang_subtypes: true,
      },
      where,
      // id breaks ties, so paging doesn't repeat or skip gangs updated at the same time
      orderBy: (gang) => [sql`${gang.last_updated} desc nulls last`, desc(gang.id)],
      limit: PUBLIC_GANGS_PAGE_SIZE,
      offset: (filters.page - 1) * PUBLIC_GANGS_PAGE_SIZE,
      with: {
        gang_portrait: { columns: { storage_path: true } },
        gang_types: { columns: { parent_gang_type_name: true } },
      },
    }),
    db.$count(gangs, where),
  ]);

  const subtypeById = await getGangSubtypesById(db, pageRows);

  return {
    gangs: pageRows.map((gang) => toGangCard(gang, subtypeById)),
    total,
  };
}
