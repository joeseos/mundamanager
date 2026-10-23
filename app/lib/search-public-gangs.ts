import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

import { TAGS } from '@/utils/cache-tags';
import { getAppDb } from '@/utils/db/client';
import { editions, gangs, gangSubtypeTypes, gangTypes } from '@/utils/db/schema';
import { gangPortraitPublicUrl } from '@/types/gang';
import type { EditionSlug } from '@/types/edition';
import { detailGangTypeLabel, joinedParentGangTypeName } from '@/utils/gang-type-label';
import { PUBLIC_GANGS_PAGE_SIZE, type PublicGangFilters } from '@/utils/browse-gangs-filters';
import { getGangSubtypesById, type Gang } from '@/app/lib/get-user-gangs';

export type PublicGang = Pick<
  Gang,
  'id' | 'name' | 'gang_type' | 'parent_gang_type_name' | 'gang_subtypes' | 'rating' | 'image_url' | 'gang_portrait_url'
>;

export interface PublicGangFilterOption {
  value: string;
  label: string;
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
 * and hidden gang types are left out. Read over the direct connection, so the page
 * authenticates the request before calling this.
 */
export async function searchPublicGangs(filters: PublicGangFilters): Promise<{
  gangs: PublicGang[];
  total: number;
}> {
  const db = getAppDb();
  const where = and(
    eq(gangs.hidden, false),
    isNull(gangs.custom_gang_type_id),
    // A gang's edition is its gang type's; hidden gang types are left out, as in the filter options
    inArray(
      gangs.gang_type_id,
      db.select({ id: gangTypes.id })
        .from(gangTypes)
        .innerJoin(editions, eq(editions.id, gangTypes.edition_id))
        .where(and(eq(editions.slug, filters.edition), eq(gangTypes.is_hidden, false)))
    ),
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
    total,
  };
}
