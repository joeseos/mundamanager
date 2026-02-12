import { createClient } from "@/utils/supabase/server";

export interface CustomSkill {
  id: string;
  user_id: string;
  skill_name: string;
  skill_type_id: string;
  skill_type_name?: string;
  created_at: string;
  updated_at?: string;
}

export async function getUserCustomSkills(userId: string): Promise<CustomSkill[]> {
  const supabase = await createClient();

  const { data: customSkills, error } = await supabase
    .from('custom_skills')
    .select(`
      id,
      user_id,
      skill_name,
      skill_type_id,
      created_at,
      updated_at,
      skill_types (
        name
      )
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
    skill_type_name: skill.skill_types?.name || 'Unknown',
    created_at: skill.created_at,
    updated_at: skill.updated_at,
  }));
}
