'use server'

import { createClient } from '@/utils/supabase/server';
import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';

interface GangDetailsResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Internal helper function that calls the get_gang_details RPC
 * This function is not cached and should only be called by the cached wrapper
 */
async function _getGangDetails(gangId: string, supabase: any): Promise<GangDetailsResult> {
  try {
    const { data, error } = await supabase.rpc('get_gang_details', {
      p_gang_id: gangId
    });

    if (error) {
      console.error('Error in get_gang_details RPC:', error);
      throw error;
    }

    const [gangData] = data || [];
    
    if (!gangData) {
      return {
        success: false,
        error: 'Gang not found'
      };
    }

    return {
      success: true,
      data: gangData
    };
  } catch (error) {
    console.error('Error in _getGangDetails:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

/**
 * Cached version of get_gang_details RPC call
 * Uses existing cache tags that are already invalidated by equipment actions
 * 
 * Cache Tags Used:
 * - GANG_OVERVIEW: Gang basic info, stash, campaigns, vehicles
 * - GANG_CREDITS: Gang credits (invalidated by equipment purchases)  
 * - GANG_RATING: Gang rating calculated from fighters
 * - GANG_FIGHTERS_LIST: All fighters with equipment, skills, effects
 */
export async function getGangDetails(gangId: string): Promise<GangDetailsResult> {
  try {
    const supabase = await createClient();
    
    return unstable_cache(
      async () => {
        return _getGangDetails(gangId, supabase);
      },
      [`gang-details-${gangId}`],
      {
        tags: [
          CACHE_TAGS.GANG_OVERVIEW(gangId),    // Gang basic info, stash, vehicles
          CACHE_TAGS.GANG_CREDITS(gangId),     // Gang credits (auto-invalidated by equipment)
          CACHE_TAGS.GANG_RATING(gangId),      // Gang rating (auto-invalidated by equipment)
          CACHE_TAGS.GANG_FIGHTERS_LIST(gangId) // All fighters data (auto-invalidated by equipment)
        ],
        revalidate: false // Only revalidate when tags are invalidated
      }
    )();
  } catch (error) {
    console.error('Error in getGangDetails:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}