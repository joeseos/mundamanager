import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';

import { createServiceRoleClient } from '@/utils/supabase/server';
import { EDITION_N26 } from '@/types/edition';
import type { StatWithEdition } from '@/types/stats';

type ServiceRoleClient = ReturnType<typeof createServiceRoleClient>;

async function getN26EditionId(
  supabase: ServiceRoleClient
): Promise<string | null> {
  const { data, error } = await supabase
    .from('editions')
    .select('id')
    .eq('slug', EDITION_N26)
    .maybeSingle();

  if (error) {
    console.error('Error fetching n26 edition id:', error);
    return null;
  }

  return data?.id ?? null;
}

function splitEditionCounts(
  total: number | null,
  n26: number | null
): StatWithEdition {
  if (total === null || n26 === null) {
    return { total, n23: null, n26: null };
  }

  return {
    total,
    n23: Math.max(0, total - n26),
    n26,
  };
}

async function countN26Gangs(
  supabase: ServiceRoleClient,
  n26EditionId: string,
  since?: string
): Promise<number | null> {
  let officialQuery = supabase
    .from('gangs')
    .select('id, gang_types!inner(edition_id)', { count: 'exact', head: true })
    .eq('gang_types.edition_id', n26EditionId);

  let customQuery = supabase
    .from('gangs')
    .select('id, custom_gang_types!inner(edition_id)', {
      count: 'exact',
      head: true,
    })
    .eq('custom_gang_types.edition_id', n26EditionId);

  if (since) {
    officialQuery = officialQuery.gte('last_updated', since);
    customQuery = customQuery.gte('last_updated', since);
  }

  const [official, custom] = await Promise.all([officialQuery, customQuery]);

  if (official.error) {
    console.error('Error fetching n26 official gang count:', official.error);
    return null;
  }
  if (custom.error) {
    console.error('Error fetching n26 custom gang count:', custom.error);
    return null;
  }

  return (official.count ?? 0) + (custom.count ?? 0);
}

async function countN26Campaigns(
  supabase: ServiceRoleClient,
  n26EditionId: string,
  since?: string
): Promise<number | null> {
  let query = supabase
    .from('campaigns')
    .select('id, campaign_types!inner(edition_id)', {
      count: 'exact',
      head: true,
    })
    .eq('campaign_types.edition_id', n26EditionId);

  if (since) {
    query = query.gte('updated_at', since);
  }

  const { count, error } = await query;

  if (error) {
    console.error('Error fetching n26 campaign count:', error);
    return null;
  }

  return count ?? 0;
}

async function fetchGangCountsByEdition(
  since?: string
): Promise<StatWithEdition | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const supabase = createServiceRoleClient();
  const n26EditionId = await getN26EditionId(supabase);
  if (!n26EditionId) {
    return null;
  }

  let totalQuery = supabase
    .from('gangs')
    .select('*', { count: 'exact', head: true });

  if (since) {
    totalQuery = totalQuery.gte('last_updated', since);
  }

  const [{ count, error }, n26] = await Promise.all([
    totalQuery,
    countN26Gangs(supabase, n26EditionId, since),
  ]);

  if (error) {
    console.error('Error fetching gang count:', error);
    return null;
  }

  return splitEditionCounts(count ?? 0, n26);
}

async function fetchCampaignCountsByEdition(
  since?: string
): Promise<StatWithEdition | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const supabase = createServiceRoleClient();
  const n26EditionId = await getN26EditionId(supabase);
  if (!n26EditionId) {
    return null;
  }

  let totalQuery = supabase
    .from('campaigns')
    .select('*', { count: 'exact', head: true });

  if (since) {
    totalQuery = totalQuery.gte('updated_at', since);
  }

  const [{ count, error }, n26] = await Promise.all([
    totalQuery,
    countN26Campaigns(supabase, n26EditionId, since),
  ]);

  if (error) {
    console.error('Error fetching campaign count:', error);
    return null;
  }

  return splitEditionCounts(count ?? 0, n26);
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
): Promise<StatWithEdition | null> {
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
): Promise<StatWithEdition | null> {
  if (since) {
    return fetchCampaignCountsByEdition(since);
  }
  return getCachedCampaignCountsByEdition();
}
