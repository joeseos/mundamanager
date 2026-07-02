import { cacheTag, cacheLife } from 'next/cache';
import { CACHE_TAGS } from "@/utils/cache-tags";
import { createServiceRoleClient } from '@/utils/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CustomSkillType {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at?: string;
}

export async function getUserCustomSkillTypes(userId: string, supabase: SupabaseClient): Promise<CustomSkillType[]> {
  const { data, error } = await supabase
    .from('custom_skill_types')
    .select('id, user_id, name, created_at, updated_at')
    .eq('user_id', userId)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching custom skill types:', error);
    throw new Error(`Failed to fetch custom skill types: ${error.message}`);
  }

  return data || [];
}

export interface CustomSkill {
  id: string;
  user_id: string;
  skill_name: string;
  skill_type_id?: string;
  custom_skill_type_id?: string;
  skill_type_name?: string;
  description?: string | null;
  created_at: string;
  updated_at?: string;
}

export async function getUserCustomSkills(userId: string): Promise<CustomSkill[]> {
  'use cache: remote';
  cacheLife('max');
  cacheTag(CACHE_TAGS.USER_CUSTOM_SKILLS(userId));

  const supabase = createServiceRoleClient();
  const { data: customSkills, error } = await supabase
    .from('custom_skills')
    .select(`
      id,
      user_id,
      skill_name,
      skill_type_id,
      custom_skill_type_id,
      description,
      created_at,
      updated_at,
      skill_types (name),
      custom_skill_types (name)
    `)
    .eq('user_id', userId)
    .order('skill_name', { ascending: true });

  if (error) {
    console.error('Error fetching custom skills:', error);
    throw new Error(`Failed to fetch custom skills: ${error.message}`);
  }

  return (customSkills || []).map((skill: any) => ({
    id: skill.id,
    user_id: skill.user_id,
    skill_name: skill.skill_name,
    skill_type_id: skill.skill_type_id,
    custom_skill_type_id: skill.custom_skill_type_id,
    skill_type_name: skill.skill_types?.name || skill.custom_skill_types?.name || 'Unknown',
    description: skill.description,
    created_at: skill.created_at,
    updated_at: skill.updated_at,
  }));
}
