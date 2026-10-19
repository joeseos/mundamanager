import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { inArray } from 'drizzle-orm';
import { getAppDb } from '@/utils/db/client';
import { gangTypes } from '@/utils/db/schema';
import { withEditionSlug } from '@/types/edition';
import { compareScenarioTableEntries, type Scenario, type ScenarioTableWithEntries } from '@/types/campaign';

/**
 * Cached global reference data (admin-owned tables, not scoped to any
 * gang/campaign instance). Invalidated by the admin routes that edit these
 * tables (plus a time-based fallback where noted). Every signed-in user reads
 * the same rows, so the direct connection reads them for everyone.
 */

export type { Scenario };

export const getScenariosCached = async (): Promise<Scenario[]> => {
  return unstable_cache(
    async () => {
      const scenarios = await getAppDb().query.scenarios.findMany({
        columns: { id: true, scenario_name: true, scenario_number: true },
        orderBy: (scenario, { asc }) => asc(scenario.scenario_number),
        with: { editions: { columns: { slug: true } } },
      });
      return scenarios.map(withEditionSlug);
    },
    ['global-scenarios'],
    {
      tags: [TAGS.globalScenarios()],
      revalidate: 3600
    }
  )();
};

export interface TradingPostType {
  id: string;
  trading_post_name: string | null;
  edition_slug?: string | null;
}

export const getTradingPostTypesCached = async (): Promise<TradingPostType[]> => {
  return unstable_cache(
    async () => {
      const tradingPostTypes = await getAppDb().query.tradingPostTypes.findMany({
        columns: { id: true, trading_post_name: true },
        orderBy: (tradingPostType, { asc }) => asc(tradingPostType.trading_post_name),
        with: { editions: { columns: { slug: true } } },
      });
      return tradingPostTypes.map(withEditionSlug);
    },
    ['global-trading-post-types'],
    {
      tags: [TAGS.globalTradingPostTypes()],
      revalidate: 3600
    }
  )();
};

/**
 * Get all campaign types with persistent caching
 */
export const getCampaignTypes = async () => {
  return unstable_cache(
    async () => {
      const campaignTypes = await getAppDb().query.campaignTypes.findMany({
        columns: { id: true, campaign_type_name: true, trading_posts: true },
        orderBy: (campaignType, { asc }) => asc(campaignType.campaign_type_name),
        with: { editions: { columns: { slug: true } } },
      });
      return campaignTypes.map(withEditionSlug);
    },
    ['campaign-types'],
    {
      tags: [TAGS.campaignTypes()],
      revalidate: false
    }
  )();
};

/**
 * Get all territories with persistent caching
 * Used by territory selection components
 */
export const getAllTerritories = async () => {
  return unstable_cache(
    async () => {
      const territories = await getAppDb().query.territories.findMany({
        columns: { id: true, territory_name: true, campaign_type_id: true, playing_card: true },
        orderBy: (territory, { asc }) => asc(territory.territory_name),
        with: { editions: { columns: { slug: true } } },
      });
      return territories.map(territory => ({
        ...withEditionSlug(territory),
        territory_id: territory.id
      }));
    },
    ['territories-list'],
    {
      tags: [TAGS.globalTerritories()],
      revalidate: false
    }
  )();
};

/**
 * Every edition's scenario tables with their entries, for the N26 battle log
 * and battle session pickers. Also tagged with gang types: a house table lists
 * the gang types that roll on it, its alternate lists included. The direct
 * connection reads the same rows whoever asks, so a signed-out caller (the
 * battle data route has no sign-in check) can never fill the shared cache with
 * less.
 */
export const getScenarioTablesCached = async (): Promise<ScenarioTableWithEntries[]> =>
  unstable_cache(
    async () => {
      const db = getAppDb();
      const tables = await db.query.scenarioTables.findMany({
        columns: { id: true, name: true, edition_id: true, gang_type_id: true, table_type: true },
        with: {
          editions: { columns: { slug: true } },
          entries: {
            columns: { id: true, name: true, d6_min: true, d6_max: true, scenario_table_id: true, edition_id: true },
          },
        },
      });

      const houseIds = tables.flatMap((table) => (table.gang_type_id ? [table.gang_type_id] : []));
      const alternates = houseIds.length > 0
        ? await db
            .select({ id: gangTypes.id, parent_gang_type_id: gangTypes.parent_gang_type_id })
            .from(gangTypes)
            .where(inArray(gangTypes.parent_gang_type_id, houseIds))
        : [];

      return tables.map(({ entries, ...table }) => ({
        ...withEditionSlug(table),
        gang_type_ids: table.gang_type_id
          ? [
              table.gang_type_id,
              ...alternates
                .filter((alternate) => alternate.parent_gang_type_id === table.gang_type_id)
                .map((alternate) => alternate.id),
            ]
          : [],
        entries: entries.sort(compareScenarioTableEntries),
      }));
    },
    ['global-scenario-tables'],
    {
      tags: [TAGS.globalScenarioTables(), TAGS.globalGangTypes()],
      revalidate: false
    }
  )();

/**
 * Get campaign triumphs for a campaign type with persistent caching
 */
export const getCampaignTriumphs = async (campaignTypeId: string) => {
  return unstable_cache(
    async () => {
      return getAppDb().query.campaignTriumphs.findMany({
        columns: { id: true, triumph: true, criteria: true, campaign_type_id: true },
        extras: (triumph, { sql }) => ({
          created_at: sql<string>`to_json(${triumph.created_at})`.as('created_at'),
          updated_at: sql<string | null>`to_json(${triumph.updated_at})`.as('updated_at'),
        }),
        where: (triumph, { eq }) => eq(triumph.campaign_type_id, campaignTypeId),
        orderBy: (triumph, { asc }) => asc(triumph.triumph),
      });
    },
    [`campaign-triumphs-${campaignTypeId}`],
    {
      tags: [TAGS.campaignTriumphs()],
      revalidate: false
    }
  )();
};
