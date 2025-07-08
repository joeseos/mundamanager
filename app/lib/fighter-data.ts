import { createClient } from '@/utils/supabase/server';
import { unstable_cache } from 'next/cache';
import { CACHE_TAGS } from '@/utils/cache-tags';
import type { SupabaseClient } from '@supabase/supabase-js';

// Internal helper functions
async function _getGangFighters(gangId: string, supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('fighters')
    .select('id, fighter_name, fighter_type, xp')
    .eq('gang_id', gangId);
  if (error) throw error;
  return data;
}

async function _getAdvancementCategories(advancementType: 'characteristic' | 'skill', supabase: SupabaseClient) {
  if (advancementType === 'characteristic') {
    const { data, error } = await supabase
      .from('fighter_effect_types')
      .select('*')
      .eq('fighter_effect_category_id', '789b2065-c26d-453b-a4d5-81c04c5d4419')
      .order('effect_name');
    
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from('skill_types')
      .select('*')
      .order('name');
    
    if (error) throw error;
    return data;
  }
}

// 🚀 OPTIMIZED PUBLIC API FUNCTIONS USING unstable_cache()

/**
 * Get gang fighters with persistent caching
 * Cache key: gang-fighters-{gangId}
 * Invalidation: Server actions only via revalidateTag()
 */
export const getGangFighters = async (gangId: string) => {
  const supabase = await createClient();
  return unstable_cache(
    async () => {
      return _getGangFighters(gangId, supabase);
    },
    [`gang-fighters-${gangId}`],
    {
      tags: [CACHE_TAGS.GANG_FIGHTERS_LIST(gangId), 'gang-fighters', `gang-fighters-${gangId}`],
      revalidate: false
    }
  )();
};

export async function getAdvancementCategories(advancementType: 'characteristic' | 'skill') {
  const supabase = await createClient();
  return unstable_cache(
    async () => {
      return _getAdvancementCategories(advancementType, supabase);
    },
    [`advancement-categories-${advancementType}`],
    {
      tags: ['advancement-categories', `advancement-categories-${advancementType}`],
      revalidate: 3600 // 1 hour for reference data
    }
  )();
}

async function _getFighterAvailableAdvancements(fighterId: string, supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc('get_fighter_available_advancements', {
    fighter_id: fighterId
  });
  if (error) throw error;
  return data;
}

export async function getFighterAvailableAdvancements(fighterId: string) {
  const supabase = await createClient();
  return unstable_cache(
    async () => {
      return _getFighterAvailableAdvancements(fighterId, supabase);
    },
    [`fighter-available-advancements-${fighterId}`],
    {
      tags: [CACHE_TAGS.FIGHTER_PAGE(fighterId), 'fighter-available-advancements', `fighter-available-advancements-${fighterId}`],
      revalidate: false
    }
  )();
}

async function _getAvailableSkills(fighterId: string, supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc('get_available_skills', {
    fighter_id: fighterId
  });
  if (error) throw error;
  return data;
}

export async function getAvailableSkills(fighterId: string) {
  const supabase = await createClient();
  return unstable_cache(
    async () => {
      return _getAvailableSkills(fighterId, supabase);
    },
    [`available-skills-${fighterId}`],
    {
      tags: [CACHE_TAGS.FIGHTER_PAGE(fighterId), 'available-skills', `available-skills-${fighterId}`],
      revalidate: false
    }
  )();
}

async function _getAvailableInjuries(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('fighter_effect_types')
    .select('*')
    .eq('fighter_effect_category_id', 'injury-category-id') // Replace with actual ID
    .order('effect_name');
  if (error) throw error;
  return data;
}

export async function getAvailableInjuries() {
  const supabase = await createClient();
  return unstable_cache(
    async () => {
      return _getAvailableInjuries(supabase);
    },
    ['available-injuries'],
    {
      tags: ['available-injuries'],
      revalidate: 3600 // 1 hour for reference data
    }
  )();
}

async function _getFighterTypes(gangTypeId: string, supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc('get_add_fighter_details', {
    p_gang_type_id: gangTypeId
  });
  if (error) throw error;
  return data;
}

export async function getFighterTypes(gangTypeId: string) {
  const supabase = await createClient();
  return unstable_cache(
    async () => {
      return _getFighterTypes(gangTypeId, supabase);
    },
    [`fighter-types-${gangTypeId}`],
    {
      tags: ['fighter-types', `fighter-types-${gangTypeId}`],
      revalidate: 3600 // 1 hour for reference data
    }
  )();
}