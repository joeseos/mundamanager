import { TAGS } from '@/utils/cache-tags';
import { unstable_cache } from 'next/cache';

/**
 * Cached global reference data. Invalidated by the admin routes that edit
 * these tables (plus a time-based fallback).
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
