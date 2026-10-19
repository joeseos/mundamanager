import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { count, eq, gte, sql, type AnyColumn } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { getAppDb } from '@/utils/db/client';
import { campaigns, campaignTypes, customGangTypes, editions, gangs, gangTypes } from '@/utils/db/schema';
import { EDITION_N23, EDITION_N26, type EditionSlug } from '@/types/edition';
import type { EditionCounts } from '@/types/stats';

function buildEditionCounts(
  total: number,
  byEdition: Record<EditionSlug, number>
): EditionCounts {
  const counted = Object.values(byEdition).reduce((sum, value) => sum + value, 0);

  if (counted > total) {
    console.error(
      'Edition breakdown exceeds total count; suppressing split',
      { total, byEdition }
    );
    return { total, byEdition: null };
  }

  return { total, byEdition };
}

/** Rows counted once for each of the slug columns that names this edition. */
function countForEdition(slug: EditionSlug, slugColumns: AnyColumn[]) {
  return sql<number>`${sql.join(
    slugColumns.map((column) => sql`count(*) filter (where ${column} = ${slug})`),
    sql` + `
  )}`.mapWith(Number);
}

function editionCounts(...slugColumns: AnyColumn[]) {
  return {
    total: count(),
    [EDITION_N23]: countForEdition(EDITION_N23, slugColumns),
    [EDITION_N26]: countForEdition(EDITION_N26, slugColumns),
  };
}

const gangTypeEdition = alias(editions, 'gang_type_edition');
const customGangTypeEdition = alias(editions, 'custom_gang_type_edition');

async function fetchGangCountsByEdition(since?: string): Promise<EditionCounts> {
  // A gang's edition is its gang type's, official or custom
  const [{ total, ...byEdition }] = await getAppDb()
    .select(editionCounts(gangTypeEdition.slug, customGangTypeEdition.slug))
    .from(gangs)
    .leftJoin(gangTypes, eq(gangTypes.id, gangs.gang_type_id))
    .leftJoin(gangTypeEdition, eq(gangTypeEdition.id, gangTypes.edition_id))
    .leftJoin(customGangTypes, eq(customGangTypes.id, gangs.custom_gang_type_id))
    .leftJoin(customGangTypeEdition, eq(customGangTypeEdition.id, customGangTypes.edition_id))
    .where(since ? gte(gangs.last_updated, since) : undefined);

  return buildEditionCounts(total, byEdition);
}

async function fetchCampaignCountsByEdition(since?: string): Promise<EditionCounts> {
  const [{ total, ...byEdition }] = await getAppDb()
    .select(editionCounts(editions.slug))
    .from(campaigns)
    .leftJoin(campaignTypes, eq(campaignTypes.id, campaigns.campaign_type_id))
    .leftJoin(editions, eq(editions.id, campaignTypes.edition_id))
    .where(since ? gte(campaigns.updated_at, since) : undefined);

  return buildEditionCounts(total, byEdition);
}

const getCachedGangCountsByEdition = unstable_cache(
  async () => fetchGangCountsByEdition(),
  ['global-gang-counts-by-edition-v2'],
  {
    tags: [TAGS.globalGangCount()],
    revalidate: 86400,
  }
);

const getCachedCampaignCountsByEdition = unstable_cache(
  async () => fetchCampaignCountsByEdition(),
  ['global-campaign-counts-by-edition-v2'],
  {
    tags: [TAGS.globalCampaignCount()],
    revalidate: 86400,
  }
);

/**
 * Gang counts split by edition. Totals (no `since`) are cached for 24h.
 * Activity windows pass `since` and are not cached here — callers should cache.
 */
export async function getGangCountsByEdition(
  since?: string
): Promise<EditionCounts> {
  if (since) {
    return fetchGangCountsByEdition(since);
  }
  return getCachedGangCountsByEdition();
}

/**
 * Campaign counts split by edition. Totals (no `since`) are cached for 24h.
 * Activity windows pass `since` and are not cached here — callers should cache.
 */
export async function getCampaignCountsByEdition(
  since?: string
): Promise<EditionCounts> {
  if (since) {
    return fetchCampaignCountsByEdition(since);
  }
  return getCachedCampaignCountsByEdition();
}
