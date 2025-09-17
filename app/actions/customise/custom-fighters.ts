'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidatePath } from 'next/cache';
import { CustomFighterType } from '@/types/fighter';

export interface CreateCustomFighterData {
  fighter_type: string;
  gang_type: string;
  gang_type_id: string;
  cost: number;
  movement?: number;
  weapon_skill?: number;
  ballistic_skill?: number;
  strength?: number;
  toughness?: number;
  wounds?: number;
  initiative?: number;
  attacks?: number;
  leadership?: number;
  cool?: number;
  willpower?: number;
  intelligence?: number;
  special_rules: string[];
  free_skill: boolean;
  fighter_class: string;
  fighter_class_id: string;
  skill_access: {
    skill_type_id: string;
    access_level: 'primary' | 'secondary' | 'allowed';
  }[];
}

export async function createCustomFighter(data: CreateCustomFighterData): Promise<{ success: boolean; data?: CustomFighterType; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { data: newCustomFighter, error: insertError } = await supabase
      .from('custom_fighter_types')
      .insert({
        user_id: user.id,
        fighter_type: data.fighter_type,
        gang_type: data.gang_type,
        gang_type_id: data.gang_type_id,
        cost: data.cost,
        movement: data.movement,
        weapon_skill: data.weapon_skill,
        ballistic_skill: data.ballistic_skill,
        strength: data.strength,
        toughness: data.toughness,
        wounds: data.wounds,
        initiative: data.initiative,
        attacks: data.attacks,
        leadership: data.leadership,
        cool: data.cool,
        willpower: data.willpower,
        intelligence: data.intelligence,
        special_rules: data.special_rules,
        free_skill: data.free_skill,
        fighter_class: data.fighter_class,
        fighter_class_id: data.fighter_class_id,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating custom fighter type:', insertError);
      return { success: false, error: `Failed to create custom fighter type: ${insertError.message}` };
    }

    // Handle skill access if provided
    if (data.skill_access && Array.isArray(data.skill_access) && data.skill_access.length > 0) {
      const skillAccessRows = data.skill_access.map((row) => ({
        custom_fighter_type_id: newCustomFighter.id,
        fighter_type_id: null,
        skill_type_id: row.skill_type_id,
        access_level: row.access_level
      }));

      const { error: skillAccessError } = await supabase
        .from('fighter_type_skill_access')
        .insert(skillAccessRows);

      if (skillAccessError) {
        console.error('Error inserting skill access:', skillAccessError);
        return { success: false, error: `Failed to create skill access: ${skillAccessError.message}` };
      }
    }

    revalidatePath('/customise');
    return { success: true, data: newCustomFighter };
  } catch (error) {
    console.error('Error in createCustomFighter:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function deleteCustomFighter(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // First verify the custom fighter belongs to the user
    const { data: customFighter, error: fetchError } = await supabase
      .from('custom_fighter_types')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError) {
      console.error('Error fetching custom fighter:', fetchError);
      return { success: false, error: `Custom fighter not found: ${fetchError.message}` };
    }

    if (!customFighter) {
      return { success: false, error: 'Custom fighter type not found or not owned by user' };
    }

    // Delete the custom fighter type (skill access will cascade delete)
    const { error: deleteError } = await supabase
      .from('custom_fighter_types')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting custom fighter type:', deleteError);
      return { success: false, error: `Failed to delete custom fighter type: ${deleteError.message}` };
    }

    revalidatePath('/customise');
    return { success: true };
  } catch (error) {
    console.error('Error in deleteCustomFighter:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function updateCustomFighter(id: string, data: CreateCustomFighterData): Promise<{ success: boolean; data?: CustomFighterType; error?: string }> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    // First verify the custom fighter belongs to the user
    const { data: existingFighter, error: fetchError } = await supabase
      .from('custom_fighter_types')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !existingFighter) {
      return { success: false, error: 'Custom fighter not found or not owned by user' };
    }

    // Update the custom fighter
    const { data: updatedCustomFighter, error: updateError } = await supabase
      .from('custom_fighter_types')
      .update({
        fighter_type: data.fighter_type,
        gang_type: data.gang_type,
        gang_type_id: data.gang_type_id,
        cost: data.cost,
        movement: data.movement,
        weapon_skill: data.weapon_skill,
        ballistic_skill: data.ballistic_skill,
        strength: data.strength,
        toughness: data.toughness,
        wounds: data.wounds,
        initiative: data.initiative,
        attacks: data.attacks,
        leadership: data.leadership,
        cool: data.cool,
        willpower: data.willpower,
        intelligence: data.intelligence,
        special_rules: data.special_rules,
        free_skill: data.free_skill,
        fighter_class: data.fighter_class,
        fighter_class_id: data.fighter_class_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating custom fighter type:', updateError);
      return { success: false, error: `Failed to update custom fighter type: ${updateError.message}` };
    }

    // Delete existing skill access (will be replaced with new ones)
    const { error: deleteSkillAccessError } = await supabase
      .from('fighter_type_skill_access')
      .delete()
      .eq('custom_fighter_type_id', id);

    if (deleteSkillAccessError) {
      console.error('Error deleting existing skill access:', deleteSkillAccessError);
      return { success: false, error: `Failed to update skill access: ${deleteSkillAccessError.message}` };
    }

    // Handle skill access if provided
    if (data.skill_access && Array.isArray(data.skill_access) && data.skill_access.length > 0) {
      const skillAccessRows = data.skill_access.map((row) => ({
        custom_fighter_type_id: id,
        fighter_type_id: null,
        skill_type_id: row.skill_type_id,
        access_level: row.access_level
      }));

      const { error: skillAccessError } = await supabase
        .from('fighter_type_skill_access')
        .insert(skillAccessRows);

      if (skillAccessError) {
        console.error('Error inserting skill access:', skillAccessError);
        return { success: false, error: `Failed to update skill access: ${skillAccessError.message}` };
      }
    }

    revalidatePath('/customise');
    return { success: true, data: updatedCustomFighter };
  } catch (error) {
    console.error('Error in updateCustomFighter:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}