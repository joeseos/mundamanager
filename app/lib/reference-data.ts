import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';
import { createClient } from '@/utils/supabase/server';

/**
 * Cached global reference data (admin-owned tables, not scoped to any
 * gang/campaign instance). Invalidated by the admin routes that edit these
 * tables (plus a time-based fallback where noted).
 */

export interface Scenario {
  id: string;
  scenario_name: string;
  scenario_number: number | null;
}

export const getScenariosCached = async (supabase: any): Promise<Scenario[]> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('scenarios')
        .select('id, scenario_name, scenario_number')
        .order('scenario_number');

      if (error) throw error;
      return data || [];
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
}

export const getTradingPostTypesCached = async (supabase: any): Promise<TradingPostType[]> => {
  return unstable_cache(
    async () => {
      const { data, error } = await supabase
        .from('trading_post_types')
        .select('id, trading_post_name')
        .order('trading_post_name');

      if (error) throw error;
      return data || [];
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
        .select('id, campaign_type_name, trading_posts')
        .order('campaign_type_name');

      if (error) throw error;
      return data || [];
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
        .select('id, territory_name, campaign_type_id, playing_card')
        .order('territory_name');

      if (error) throw error;
      return (data || []).map(territory => ({
        ...territory,
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
