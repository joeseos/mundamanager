import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { withEditionSlug } from '@/types/edition';
import { compareScenarioTableEntries, type Scenario, type ScenarioTableWithEntries } from '@/types/campaign';

/**
 * Cached global reference data (admin-owned tables, not scoped to any
 * gang/campaign instance). Invalidated by the admin routes that edit these
 * tables (plus a time-based fallback where noted).
 */

export type { Scenario };

export const getScenariosCached = async (supabase: any): Promise<Scenario[]> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('scenarios')
        .select('id, scenario_name, scenario_number, editions:edition_id (slug)')
        .order('scenario_number');

      if (error) throw error;
      return (data || []).map(withEditionSlug);
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
  trading_post_name: string;
  edition_slug?: string | null;
}

export const getTradingPostTypesCached = async (supabase: any): Promise<TradingPostType[]> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('trading_post_types')
        .select('id, trading_post_name, editions:edition_id (slug)')
        .order('trading_post_name');

      if (error) throw error;
      return (data || []).map(withEditionSlug);
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
  const supabase = await createClient();
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('campaign_types')
        .select('id, campaign_type_name, trading_posts, editions:edition_id (slug)')
        .order('campaign_type_name');

      if (error) throw error;
      return (data || []).map(withEditionSlug);
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
  const supabase = await createClient();
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('territories')
        .select('id, territory_name, campaign_type_id, playing_card, editions:edition_id (slug)')
        .order('territory_name');

      if (error) throw error;
      return (data || []).map(territory => {
        const withSlug = withEditionSlug(territory);
        return {
          ...withSlug,
          territory_id: withSlug.id
        };
      });
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
 * pickers. Also tagged with gang types: a house table lists the gang types
 * that roll on it, its alternate lists included.
 */
export const getScenarioTablesCached = async (): Promise<ScenarioTableWithEntries[]> => {
  const supabase = await createClient();
  return unstable_cache(
    async () => {
      // The hint picks the plain foreign key over the composite edition one.
      const { data, error } = await supabase
        .from('scenario_tables')
        .select(
          'id, name, edition_id, gang_type_id, table_type, editions:edition_id (slug), ' +
          'entries:scenario_table_entries!scenario_table_entries_scenario_table_id_fkey (id, name, d6_min, d6_max, scenario_table_id, edition_id)'
        );
      if (error) throw error;

      const houseIds = (data ?? []).map((table: any) => table.gang_type_id).filter(Boolean);
      const { data: alternates, error: alternatesError } = houseIds.length
        ? await supabase.from('gang_types').select('id, parent_gang_type_id').in('parent_gang_type_id', houseIds)
        : { data: [], error: null };
      if (alternatesError) throw alternatesError;

      return (data ?? []).map(({ entries, ...table }: any) => ({
        ...withEditionSlug(table),
        gang_type_ids: table.gang_type_id
          ? [
              table.gang_type_id,
              ...(alternates ?? [])
                .filter((alternate: any) => alternate.parent_gang_type_id === table.gang_type_id)
                .map((alternate: any) => alternate.id),
            ]
          : [],
        entries: [...(entries ?? [])].sort(compareScenarioTableEntries),
      })) as ScenarioTableWithEntries[];
    },
    ['global-scenario-tables'],
    {
      tags: [TAGS.globalScenarioTables(), TAGS.globalGangTypes()],
      revalidate: false
    }
  )();
};

/**
 * Get campaign triumphs for a campaign type with persistent caching
 */
export const getCampaignTriumphs = async (campaignTypeId: string) => {
  const supabase = await createClient();
  return unstable_cache(
    async () => {
      const { data: triumphs, error } = await supabase
        .from('campaign_triumphs')
        .select(`
          id,
          triumph,
          criteria,
          campaign_type_id,
          created_at,
          updated_at
        `)
        .eq('campaign_type_id', campaignTypeId)
        .order('triumph', { ascending: true });

      if (error) throw error;
      return triumphs || [];
    },
    [`campaign-triumphs-${campaignTypeId}`],
    {
      tags: [TAGS.campaignTriumphs()],
      revalidate: false
    }
  )();
};
