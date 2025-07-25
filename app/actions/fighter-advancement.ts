'use server';

import { createClient } from '@/utils/supabase/server';
import { checkAdmin } from '@/utils/auth';
import { invalidateFighterData } from '@/utils/cache-tags';

// Helper function to invalidate owner's cache when beast fighter is updated
async function invalidateBeastOwnerCache(fighterId: string, gangId: string, supabase: any) {
  // Check if this fighter is an exotic beast owned by another fighter
  const { data: ownerData } = await supabase
    .from('fighter_exotic_beasts')
    .select('fighter_owner_id')
    .eq('fighter_pet_id', fighterId)
    .single();
    
  if (ownerData) {
    // Invalidate the owner's cache since their total cost changed
    invalidateFighterData(ownerData.fighter_owner_id, gangId);
  }
}

// Types for advancement operations
export interface AddCharacteristicAdvancementParams {
  fighter_id: string;
  fighter_effect_type_id: string;
  xp_cost: number;
  credits_increase: number;
}

export interface AddSkillAdvancementParams {
  fighter_id: string;
  skill_id: string;
  xp_cost: number;
  credits_increase: number;
  is_advance?: boolean;
}

export interface DeleteAdvancementParams {
  fighter_id: string;
  advancement_id: string;
  advancement_type: 'skill' | 'characteristic';
}

export interface AdvancementResult {
  success: boolean;
  error?: string;
  fighter?: {
    id: string;
    xp: number;
  };
  advancement?: {
    credits_increase: number;
  };
  remaining_xp?: number;
}

export async function addCharacteristicAdvancement(
  params: AddCharacteristicAdvancementParams
): Promise<AdvancementResult> {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    // Check if user is an admin
    const isAdmin = await checkAdmin(supabase);

    // Verify fighter ownership and get fighter data
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, user_id, gang_id, xp, free_skill')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      return { success: false, error: 'Fighter not found' };
    }

    // Check permissions - if not admin, must be fighter owner
    if (!isAdmin && fighter.user_id !== user.id) {
      return { success: false, error: 'Access denied' };
    }

    // Check if fighter has enough XP
    if (fighter.xp < params.xp_cost) {
      return { success: false, error: 'Insufficient XP' };
    }

    // Get the effect type details
    const { data: effectType, error: effectTypeError } = await supabase
      .from('fighter_effect_types')
      .select('id, effect_name, type_specific_data')
      .eq('id', params.fighter_effect_type_id)
      .single();

    if (effectTypeError || !effectType) {
      return { success: false, error: 'Effect type not found' };
    }

    // Calculate times increased (count existing effects of this type for this fighter)
    const { count: existingEffectsCount } = await supabase
      .from('fighter_effects')
      .select('*', { count: 'exact', head: true })
      .eq('fighter_id', params.fighter_id)
      .eq('fighter_effect_type_id', params.fighter_effect_type_id);

    const timesIncreased = (existingEffectsCount || 0) + 1;

    // Determine stat name from effect name
    const statName = effectType.effect_name.toLowerCase().replace(/ /g, '_');

    // Merge type_specific_data with user values
    const mergedTypeData = {
      ...(effectType.type_specific_data || {}),
      times_increased: timesIncreased,
      xp_cost: params.xp_cost,
      credits_increase: params.credits_increase
    };

    // Insert the new advancement as a fighter effect
    const { data: insertedEffect, error: insertError } = await supabase
      .from('fighter_effects')
      .insert({
        fighter_id: params.fighter_id,
        fighter_effect_type_id: params.fighter_effect_type_id,
        effect_name: effectType.effect_name,
        type_specific_data: mergedTypeData,
        user_id: user.id
      })
      .select('id')
      .single();

    if (insertError || !insertedEffect) {
      return { success: false, error: 'Failed to insert fighter effect' };
    }

    // Get the template modifier details
    const { data: modifierTemplate, error: modifierError } = await supabase
      .from('fighter_effect_type_modifiers')
      .select('id, default_numeric_value')
      .eq('fighter_effect_type_id', params.fighter_effect_type_id)
      .eq('stat_name', statName)
      .single();

    if (modifierError || !modifierTemplate) {
      return { success: false, error: 'Modifier template not found' };
    }

    // Insert the modifier with the database value
    const { error: modifierInsertError } = await supabase
      .from('fighter_effect_modifiers')
      .insert({
        fighter_effect_id: insertedEffect.id,
        stat_name: statName,
        numeric_value: modifierTemplate.default_numeric_value
      });

    if (modifierInsertError) {
      return { success: false, error: 'Failed to insert effect modifier' };
    }

    // Update fighter's XP
    const { data: updatedFighter, error: updateError } = await supabase
      .from('fighters')
      .update({ 
        xp: fighter.xp - params.xp_cost,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.fighter_id)
      .select('id, xp')
      .single();

    if (updateError || !updatedFighter) {
      return { success: false, error: 'Failed to update fighter XP' };
    }

    // Invalidate fighter cache
    invalidateFighterData(params.fighter_id, fighter.gang_id);
    
    // If this is a beast fighter, also invalidate owner's cache
    await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase);

    return {
      success: true,
      fighter: updatedFighter,
      advancement: {
        credits_increase: params.credits_increase
      },
      remaining_xp: updatedFighter.xp
    };

  } catch (error) {
    console.error('Error adding characteristic advancement:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
}

export async function addSkillAdvancement(
  params: AddSkillAdvancementParams
): Promise<AdvancementResult> {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    // Check if user is an admin
    const isAdmin = await checkAdmin(supabase);

    // Verify fighter ownership and get fighter data
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, user_id, gang_id, xp, free_skill')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      return { success: false, error: 'Fighter not found' };
    }

    // Check permissions - if not admin, must be fighter owner
    if (!isAdmin && fighter.user_id !== user.id) {
      return { success: false, error: 'Access denied' };
    }

    // Check if fighter has enough XP
    if (fighter.xp < params.xp_cost) {
      return { success: false, error: 'Insufficient XP' };
    }

    // Insert the new skill advancement
    const { data: insertedSkill, error: insertError } = await supabase
      .from('fighter_skills')
      .insert({
        fighter_id: params.fighter_id,
        skill_id: params.skill_id,
        credits_increase: params.credits_increase,
        xp_cost: params.xp_cost,
        is_advance: params.is_advance ?? true,
        user_id: user.id,
        updated_at: new Date().toISOString()
      })
      .select('id, fighter_id, skill_id, credits_increase, xp_cost, is_advance')
      .single();

    if (insertError || !insertedSkill) {
      console.error('Database insert error:', insertError);
      return { 
        success: false, 
        error: insertError?.message || 'Failed to insert fighter skill'
      };
    }

    // Update fighter's XP and conditionally set free_skill to false
    const updateData: any = {
      xp: fighter.xp - params.xp_cost,
      updated_at: new Date().toISOString()
    };
    
    // Set free_skill to false only for regular skills (is_advance: false) when fighter currently has free_skill: true (missing starting skill)
    // Do NOT set free_skill to false for advancement skills (is_advance: true) as those are purchased with XP, not starting skills
    if (!(params.is_advance ?? true) && fighter.free_skill) {
      updateData.free_skill = false;
    }
    
    const { data: updatedFighter, error: updateError } = await supabase
      .from('fighters')
      .update(updateData)
      .eq('id', params.fighter_id)
      .select('id, xp, free_skill')
      .single();

    if (updateError || !updatedFighter) {
      return { success: false, error: 'Failed to update fighter' };
    }

    // Invalidate fighter cache
    invalidateFighterData(params.fighter_id, fighter.gang_id);
    
    // If this is a beast fighter, also invalidate owner's cache
    await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase);

    return {
      success: true,
      fighter: updatedFighter,
      advancement: {
        credits_increase: params.credits_increase
      },
      remaining_xp: updatedFighter.xp
    };

  } catch (error) {
    console.error('Error adding skill advancement:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
}

export async function deleteAdvancement(
  params: DeleteAdvancementParams
): Promise<AdvancementResult> {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'Authentication required' };
    }

    // Check if user is an admin
    const isAdmin = await checkAdmin(supabase);

    // Verify fighter ownership
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, user_id, gang_id, xp, free_skill')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      return { success: false, error: 'Fighter not found' };
    }

    // Check permissions - if not admin, must be fighter owner
    if (!isAdmin && fighter.user_id !== user.id) {
      return { success: false, error: 'Access denied' };
    }

    let xpToRefund = 0;
    let newFreeSkillStatus = fighter.free_skill;

    if (params.advancement_type === 'skill') {
      // Handle skill deletion
      
      // Check if skill exists and get skill data
      const { data: skillData, error: skillError } = await supabase
        .from('fighter_skills')
        .select('id, fighter_id, skill_id, xp_cost')
        .eq('id', params.advancement_id)
        .single();

      if (skillError || !skillData) {
        return { success: false, error: 'Skill not found' };
      }

      if (skillData.fighter_id !== params.fighter_id) {
        return { success: false, error: 'Skill does not belong to this fighter' };
      }

      xpToRefund = skillData.xp_cost || 0;

      // Get fighter type info
      const { data: fighterTypeData, error: fighterTypeError } = await supabase
        .from('fighters')
        .select(`
          fighter_type_id,
          fighter_types!inner(id, free_skill)
        `)
        .eq('id', params.fighter_id)
        .single();

      if (fighterTypeError || !fighterTypeData) {
        return { success: false, error: 'Fighter type not found' };
      }

      const fighterType = Array.isArray(fighterTypeData.fighter_types) 
        ? fighterTypeData.fighter_types[0] 
        : fighterTypeData.fighter_types;

      // Delete the skill
      const { error: deleteError } = await supabase
        .from('fighter_skills')
        .delete()
        .eq('id', params.advancement_id);

      if (deleteError) {
        return { success: false, error: 'Failed to delete skill' };
      }

      // Count default skills for this fighter type
      const { count: defaultSkillCount } = await supabase
        .from('fighter_defaults')
        .select('*', { count: 'exact', head: true })
        .eq('fighter_type_id', fighterTypeData.fighter_type_id)
        .not('skill_id', 'is', null);

      // Count remaining skills for this fighter
      const { count: remainingSkillCount } = await supabase
        .from('fighter_skills')
        .select('*', { count: 'exact', head: true })
        .eq('fighter_id', params.fighter_id);

      // Check if deleted skill was a default skill
      const { count: wasDefaultSkill } = await supabase
        .from('fighter_defaults')
        .select('*', { count: 'exact', head: true })
        .eq('fighter_type_id', fighterTypeData.fighter_type_id)
        .eq('skill_id', skillData.skill_id);

      // Determine free_skill status
      // If fighter type has free_skill = true AND remaining skills <= default skills AND deleted skill was NOT default
      newFreeSkillStatus = fighterType.free_skill && 
                          (remainingSkillCount || 0) <= (defaultSkillCount || 0) && 
                          (wasDefaultSkill || 0) === 0;

    } else {
      // Handle effect deletion
      
      // Check if effect exists and get effect data
      const { data: effectData, error: effectError } = await supabase
        .from('fighter_effects')
        .select('id, fighter_id, type_specific_data')
        .eq('id', params.advancement_id)
        .single();

      if (effectError || !effectData) {
        return { success: false, error: 'Effect not found' };
      }

      if (effectData.fighter_id !== params.fighter_id) {
        return { success: false, error: 'Effect does not belong to this fighter' };
      }

      // Extract XP cost from type_specific_data
      if (effectData.type_specific_data && typeof effectData.type_specific_data === 'object') {
        const typeData = effectData.type_specific_data as any;
        xpToRefund = typeData.xp_cost || 0;
      }

      // Delete the effect (this will cascade delete the modifiers)
      const { error: deleteError } = await supabase
        .from('fighter_effects')
        .delete()
        .eq('id', params.advancement_id);

      if (deleteError) {
        return { success: false, error: 'Failed to delete effect' };
      }

      // For effects, free_skill status doesn't change
      newFreeSkillStatus = fighter.free_skill;
    }

    // Update fighter's XP and free_skill status
    const { data: updatedFighter, error: updateError } = await supabase
      .from('fighters')
      .update({ 
        xp: fighter.xp + xpToRefund,
        free_skill: newFreeSkillStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.fighter_id)
      .select('id, xp')
      .single();

    if (updateError || !updatedFighter) {
      return { success: false, error: 'Failed to update fighter' };
    }

    // Invalidate fighter cache
    invalidateFighterData(params.fighter_id, fighter.gang_id);
    
    // If this is a beast fighter, also invalidate owner's cache
    await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase);

    return {
      success: true,
      fighter: updatedFighter,
      remaining_xp: updatedFighter.xp
    };

  } catch (error) {
    console.error('Error deleting advancement:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
} 