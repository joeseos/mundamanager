'use server';

import { createClient } from "@/utils/supabase/server";
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidatePath } from "next/cache";
import { invalidateFighterAdvancement } from "@/utils/cache-tags";

export async function createCustomSkill(data: {
  skill_name: string;
  skill_type_id: string;
}) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const { data: newSkill, error } = await supabase
    .from('custom_skills')
    .insert({
      user_id: user.id,
      skill_name: data.skill_name.trimEnd(),
      skill_type_id: data.skill_type_id,
      created_at: new Date().toISOString()
    })
    .select(`
      id,
      user_id,
      skill_name,
      skill_type_id,
      created_at,
      updated_at,
      skill_types (name)
    `)
    .single();

  if (error) {
    console.error('Error creating custom skill:', error);
    throw new Error(`Failed to create skill: ${error.message}`);
  }

  revalidatePath('/');

  return {
    ...newSkill,
    skill_type_name: (newSkill as any).skill_types?.name || 'Unknown',
  };
}

export async function updateCustomSkill(
  skillId: string,
  updates: {
    skill_name?: string;
    skill_type_id?: string;
  }
) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const updateData: any = {
    ...updates,
    updated_at: new Date().toISOString()
  };

  if (updates.skill_name !== undefined) {
    updateData.skill_name = updates.skill_name.trimEnd();
  }

  // Find fighters that have this skill so we can invalidate their caches
  const { data: affectedFighters } = await supabase
    .from('fighter_skills')
    .select('fighter_id, fighters!inner(gang_id)')
    .eq('custom_skill_id', skillId);

  const { data, error } = await supabase
    .from('custom_skills')
    .update(updateData)
    .eq('id', skillId)
    .eq('user_id', user.id)
    .select(`
      id,
      user_id,
      skill_name,
      skill_type_id,
      created_at,
      updated_at,
      skill_types (name)
    `)
    .single();

  if (error) {
    console.error('Error updating custom skill:', error);
    throw new Error(`Failed to update skill: ${error.message}`);
  }

  revalidatePath('/');

  if (affectedFighters && affectedFighters.length > 0) {
    for (const row of affectedFighters) {
      invalidateFighterAdvancement({
        fighterId: row.fighter_id,
        gangId: (row.fighters as any).gang_id,
        advancementType: 'skill'
      });
    }
  }

  return {
    ...data,
    skill_type_name: (data as any).skill_types?.name || 'Unknown',
  };
}

export async function deleteCustomSkill(skillId: string) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  // Find fighters that have this skill so we can invalidate their caches
  const { data: affectedFighters } = await supabase
    .from('fighter_skills')
    .select('fighter_id, fighters!inner(gang_id)')
    .eq('custom_skill_id', skillId);

  const { error } = await supabase
    .from('custom_skills')
    .delete()
    .eq('id', skillId)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error deleting custom skill:', error);
    throw new Error(`Failed to delete skill: ${error.message}`);
  }

  revalidatePath('/');

  if (affectedFighters && affectedFighters.length > 0) {
    for (const row of affectedFighters) {
      invalidateFighterAdvancement({
        fighterId: row.fighter_id,
        gangId: (row.fighters as any).gang_id,
        advancementType: 'skill'
      });
    }
  }

  return { success: true };
}
