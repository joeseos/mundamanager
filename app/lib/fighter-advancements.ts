import { unstable_cache } from 'next/cache';
import { TAGS } from '@/utils/cache-tags';
import { getGangFightersBundle } from '@/app/lib/shared/gang-data';

async function _getAdvancementCategories(advancementType: 'characteristic' | 'skill', supabase: any) {
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
 * Get gang fighters (id/name/status columns) — selector over the shared
 * gang fighters bundle, so it reads the same cache entry as the gang page
 * instead of maintaining a duplicate copy of the gang's fighter list.
 */
export const getGangFighters = async (gangId: string, supabase: any) => {
  const bundle = await getGangFightersBundle(gangId, supabase);
  return bundle.fighters.map((f: any) => ({
    id: f.id,
    fighter_name: f.fighter_name,
    fighter_type: f.fighter_type,
    xp: f.xp,
    killed: f.killed,
    retired: f.retired,
    enslaved: f.enslaved,
    starved: f.starved,
    recovery: f.recovery,
    captured: f.captured
  }));
};

export async function getAdvancementCategories(advancementType: 'characteristic' | 'skill', supabase: any) {
  return unstable_cache(
    async () => {
      return _getAdvancementCategories(advancementType, supabase);
    },
    [`advancement-categories-${advancementType}`],
    {
      tags: [TAGS.advancementCategories()],
      revalidate: 3600 // 1 hour for reference data
    }
  )();
}

async function _getFighterAvailableAdvancements(fighterId: string, supabase: any) {
  const { data, error } = await supabase.rpc('get_fighter_available_advancements', {
    fighter_id: fighterId
  });
  if (error) throw error;
  return data;
}

export async function getFighterAvailableAdvancements(fighterId: string, supabase: any) {
  return unstable_cache(
    async () => {
      return _getFighterAvailableAdvancements(fighterId, supabase);
    },
    [`fighter-available-advancements-v2-${fighterId}`],
    {
      // fighter-{id} so gaining xp/advancements actually refreshes this
      // (the old ad-hoc tags were never fired by any mutation).
      tags: [TAGS.fighter(fighterId), TAGS.advancementCategories()],
      revalidate: false
    }
  )();
}

async function _getAvailableSkills(fighterId: string, supabase: any) {
  const { data, error } = await supabase.rpc('get_available_skills', {
    fighter_id: fighterId
  });
  if (error) throw error;
  return data;
}

export async function getAvailableSkills(fighterId: string, supabase: any) {
  return unstable_cache(
    async () => {
      return _getAvailableSkills(fighterId, supabase);
    },
    [`available-skills-v2-${fighterId}`],
    {
      // fighter-{id} so learning a skill actually refreshes this
      // (the old ad-hoc tags were never fired by any mutation).
      tags: [TAGS.fighter(fighterId), TAGS.availableSkills()],
      revalidate: false
    }
  )();
}

async function _getAvailableInjuries(supabase: any) {
  const { data, error } = await supabase
    .from('fighter_effect_types')
    .select('*')
    .eq('fighter_effect_category_id', 'injury-category-id') // Replace with actual ID
    .order('effect_name');
  if (error) throw error;
  return data;
}

export async function getAvailableInjuries(supabase: any) {
  return unstable_cache(
    async () => {
      return _getAvailableInjuries(supabase);
    },
    ['available-injuries'],
    {
      tags: [TAGS.availableInjuries()],
      revalidate: 3600 // 1 hour for reference data
    }
  )();
}

