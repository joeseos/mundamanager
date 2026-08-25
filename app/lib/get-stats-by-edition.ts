import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';

import { getEditionIdBySlug } from '@/app/lib/editions';
import { createServiceRoleClient } from '@/utils/supabase/server';
import { EDITION_N23, EDITION_N26, type EditionSlug } from '@/types/edition';
import type { EditionCounts } from '@/types/stats';

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;

function buildEditionCounts(
  total: number | null,
  byEdition: Partial<Record<EditionSlug, number>> | null
): EditionCounts {
  if (total === null || byEdition === null) {
    return { total, byEdition: null };
  }

  const counted = Object.values(byEdition).reduce(
    (sum, value) => sum + (value ?? 0),
    0
  );

  if (counted > total) {
    console.error(
      'Edition breakdown exceeds total count; suppressing split',
      { total, byEdition }
    );
    return { total, byEdition: null };
  }

  return { total, byEdition };
}

async function countGangsForEdition(
  supabase: ServiceRoleClient,
  editionId: string,
  since?: string
): Promise<number | null> {
  let officialQuery = supabase
    .from('gangs')
    .select('id, gang_types!inner(edition_id)', { count: 'exact', head: true })
    .eq('gang_types.edition_id', editionId);

  let customQuery = supabase
    .from('gangs')
    .select('id, custom_gang_types!inner(edition_id)', {
      count: 'exact',
      head: true,
    })
    .eq('custom_gang_types.edition_id', editionId);

  if (since) {
    officialQuery = officialQuery.gte('last_updated', since);
    customQuery = customQuery.gte('last_updated', since);
  }

  const [official, custom] = await Promise.all([officialQuery, customQuery]);

  if (official.error) {
    console.error('Error fetching edition official gang count:', official.error);
    return null;
  }
  if (custom.error) {
    console.error('Error fetching edition custom gang count:', custom.error);
    return null;
  }

  return (official.count ?? 0) + (custom.count ?? 0);
}

async function countCampaignsForEdition(
  supabase: ServiceRoleClient,
  editionId: string,
  since?: string
): Promise<number | null> {
  let query = supabase
    .from('campaigns')
    .select('id, campaign_types!inner(edition_id)', {
      count: 'exact',
      head: true,
    })
    .eq('campaign_types.edition_id', editionId);

  if (since) {
    query = query.gte('updated_at', since);
  }

  const { count, error } = await query;

  if (error) {
    console.error('Error fetching edition campaign count:', error);
    return null;
  }

  return count ?? 0;
}

async function resolveEditionId(slug: EditionSlug): Promise<string | null> {
  try {
    return await getEditionIdBySlug(slug);
  } catch (error) {
    console.error(`Error resolving ${slug} edition id:`, error);
    return null;
  }
}

async function countByKnownEditions(
  countForEdition: (editionId: string) => Promise<number | null>
): Promise<Partial<Record<EditionSlug, number>> | null> {
  const [n23EditionId, n26EditionId] = await Promise.all([
    resolveEditionId(EDITION_N23),
    resolveEditionId(EDITION_N26),
  ]);

  const [n23, n26] = await Promise.all([
    n23EditionId ? countForEdition(n23EditionId) : Promise.resolve(null),
    n26EditionId ? countForEdition(n26EditionId) : Promise.resolve(null),
  ]);

  if (n23 === null && n26 === null) {
    return null;
  }

  const byEdition: Partial<Record<EditionSlug, number>> = {};
  if (n23 !== null) byEdition[EDITION_N23] = n23;
  if (n26 !== null) byEdition[EDITION_N26] = n26;
  return byEdition;
}

async function fetchGangCountsByEdition(
  since?: string
): Promise<EditionCounts | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const supabase = createServiceRoleClient();

  let totalQuery = supabase
    .from('gangs')
    .select('*', { count: 'exact', head: true });

  if (since) {
    totalQuery = totalQuery.gte('last_updated', since);
  }

  const [{ count, error }, byEdition] = await Promise.all([
    totalQuery,
    countByKnownEditions((editionId) =>
      countGangsForEdition(supabase, editionId, since)
    ),
  ]);

  if (error) {
    console.error('Error fetching gang count:', error);
    return null;
  }

  return buildEditionCounts(count ?? 0, byEdition);
}

async function fetchCampaignCountsByEdition(
  since?: string
): Promise<EditionCounts | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const supabase = createServiceRoleClient();

  let totalQuery = supabase
    .from('campaigns')
    .select('*', { count: 'exact', head: true });

  if (since) {
    totalQuery = totalQuery.gte('updated_at', since);
  }

  const [{ count, error }, byEdition] = await Promise.all([
    totalQuery,
    countByKnownEditions((editionId) =>
      countCampaignsForEdition(supabase, editionId, since)
    ),
  ]);

  if (error) {
    console.error('Error fetching campaign count:', error);
    return null;
  }

  return buildEditionCounts(count ?? 0, byEdition);
}

const getCachedGangCountsByEdition = unstable_cache(
  async () => fetchGangCountsByEdition(),
  ['global-gang-counts-by-edition'],
  {
    tags: [TAGS.globalGangCount()],
    revalidate: 86400,
  }
);

const getCachedCampaignCountsByEdition = unstable_cache(
  async () => fetchCampaignCountsByEdition(),
  ['global-campaign-counts-by-edition'],
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
): Promise<EditionCounts | null> {
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
): Promise<EditionCounts | null> {
  if (since) {
    return fetchCampaignCountsByEdition(since);
  }
  return getCachedCampaignCountsByEdition();
}
