'use server';

import { createClient } from '@/utils/supabase/server';
import { invalidateFighterData, invalidateFighterAdvancement, invalidateGangRating } from '@/utils/cache-tags';
import { checkAdminOptimized, getAuthenticatedUser } from '@/utils/auth';

import { 
  logCharacteristicAdvancement, 
  logSkillAdvancement, 
  logSkillAdvancementDeletion 
} from './logs/gang-fighter-logs';

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
  effect?: {
    id: string;
    effect_name: string;
    type_specific_data: any;
    created_at: string;
    fighter_effect_modifiers: Array<{
      id: string;
      fighter_effect_id: string;
      stat_name: string;
      numeric_value: number;
    }>;
  } | null;
}

export async function addCharacteristicAdvancement(
  params: AddCharacteristicAdvancementParams
): Promise<AdvancementResult> {
  try {
    const supabase = await createClient();
    
    // Check authentication with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Check if user is an admin (optimized)
    const isAdmin = await checkAdminOptimized(supabase, user);

    // Verify fighter ownership and get fighter data
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, user_id, gang_id, xp, free_skill, fighter_name')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      return { success: false, error: 'Fighter not found' };
    }

    // Note: Authorization is enforced by RLS policies on fighters table

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

    // Update fighter's XP only (characteristic is handled by effect modifiers)
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

    // Update gang rating and wealth (+credits_increase)
    try {
      const { data: gangRow } = await supabase
        .from('gangs')
        .select('rating, wealth')
        .eq('id', fighter.gang_id)
        .single();
      const currentRating = (gangRow?.rating ?? 0) as number;
      const currentWealth = (gangRow?.wealth ?? 0) as number;
      const ratingDelta = params.credits_increase || 0;
      const wealthDelta = ratingDelta; // No credits change, only rating increases
      await supabase
        .from('gangs')
        .update({
          rating: Math.max(0, currentRating + ratingDelta),
          wealth: Math.max(0, currentWealth + wealthDelta)
        })
        .eq('id', fighter.gang_id);
      invalidateGangRating(fighter.gang_id);
    } catch (e) {
      console.error('Failed to update gang rating and wealth after characteristic advancement:', e);
    }

    // Invalidate fighter cache
    invalidateFighterData(params.fighter_id, fighter.gang_id);
    
    // If this is a beast fighter, also invalidate owner's cache
    await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase);

    // Log the characteristic advancement
    await logCharacteristicAdvancement({
      gang_id: fighter.gang_id,
      fighter_id: params.fighter_id,
      fighter_name: fighter.fighter_name,
      characteristic_name: effectType.effect_name,
      xp_cost: params.xp_cost,
      credits_increase: params.credits_increase,
      remaining_xp: updatedFighter.xp,
      include_gang_rating: true
    });

    // Invalidate cache for fighter advancement (effects for characteristic advancements)
    invalidateFighterAdvancement({
      fighterId: params.fighter_id,
      gangId: fighter.gang_id,
      advancementType: 'effect'
    });

    // Get the created effect data for the response
    const { data: createdEffect, error: effectError } = await supabase
      .from('fighter_effects')
      .select(`
        id,
        effect_name,
        type_specific_data,
        created_at,
        fighter_effect_modifiers (
          id,
          fighter_effect_id,
          stat_name,
          numeric_value
        )
      `)
      .eq('id', insertedEffect.id)
      .single();

    return {
      success: true,
      fighter: updatedFighter,
      advancement: {
        credits_increase: params.credits_increase
      },
      remaining_xp: updatedFighter.xp,
      effect: createdEffect || null
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
    
    // Check authentication with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Check if user is an admin (optimized)
    const isAdmin = await checkAdminOptimized(supabase, user);

    // Verify fighter ownership and get fighter data
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, user_id, gang_id, xp, free_skill, fighter_name')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      return { success: false, error: 'Fighter not found' };
    }

    // Note: Authorization is enforced by RLS policies on fighters table

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

    // Update gang rating and wealth (+credits_increase)
    try {
      const { data: gangRow } = await supabase
        .from('gangs')
        .select('rating, wealth')
        .eq('id', fighter.gang_id)
        .single();
      const currentRating = (gangRow?.rating ?? 0) as number;
      const currentWealth = (gangRow?.wealth ?? 0) as number;
      const ratingDelta = params.credits_increase || 0;
      const wealthDelta = ratingDelta; // No credits change, only rating increases
      await supabase
        .from('gangs')
        .update({
          rating: Math.max(0, currentRating + ratingDelta),
          wealth: Math.max(0, currentWealth + wealthDelta)
        })
        .eq('id', fighter.gang_id);
      invalidateGangRating(fighter.gang_id);
    } catch (e) {
      console.error('Failed to update gang rating and wealth after skill advancement:', e);
    }

    // Invalidate fighter cache
    invalidateFighterData(params.fighter_id, fighter.gang_id);
    
    // If this is a beast fighter, also invalidate owner's cache
    await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase);

    // Get skill name for logging
    const { data: skillData } = await supabase
      .from('skills')
      .select('name')
      .eq('id', params.skill_id)
      .single();

    // Log the skill advancement
    await logSkillAdvancement({
      gang_id: fighter.gang_id,
      fighter_id: params.fighter_id,
      fighter_name: fighter.fighter_name,
      skill_name: skillData?.name || 'Unknown Skill',
      xp_cost: params.xp_cost,
      credits_increase: params.credits_increase,
      remaining_xp: updatedFighter.xp,
      is_advance: params.is_advance ?? true,
      include_gang_rating: true
    });

    // Invalidate cache for fighter advancement
    invalidateFighterAdvancement({
      fighterId: params.fighter_id,
      gangId: fighter.gang_id,
      advancementType: 'skill'
    });

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
    
    // Check authentication with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Check if user is an admin (optimized)
    const isAdmin = await checkAdminOptimized(supabase, user);

    // Verify fighter ownership
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, user_id, gang_id, xp, free_skill, fighter_name')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      return { success: false, error: 'Fighter not found' };
    }

    // Note: Authorization is enforced by RLS policies on fighters table

    let xpToRefund = 0;
    let ratingDelta = 0;
    let newFreeSkillStatus = fighter.free_skill;
    let deletedSkillName: string = '';
    let deletedEffectName: string = '';

    if (params.advancement_type === 'skill') {
      // Handle skill deletion
      
      // Check if skill exists and get skill data including credits_increase
      const { data: skillData, error: skillError } = await supabase
        .from('fighter_skills')
        .select('id, fighter_id, skill_id, xp_cost, credits_increase')
        .eq('id', params.advancement_id)
        .single();

      if (skillError || !skillData) {
        return { success: false, error: 'Skill not found' };
      }

      if (skillData.fighter_id !== params.fighter_id) {
        return { success: false, error: 'Skill does not belong to this fighter' };
      }

      xpToRefund = skillData.xp_cost || 0;
      ratingDelta -= (skillData.credits_increase || 0);

      // Get skill name for logging
      const { data: fighterSkillData } = await supabase
        .from('fighter_skills')
        .select(`
          skills!inner(name)
        `)
        .eq('id', params.advancement_id)
        .single();
      if (fighterSkillData && fighterSkillData.skills) {
        const skills = Array.isArray(fighterSkillData.skills)
          ? fighterSkillData.skills
          : [fighterSkillData.skills];
        deletedSkillName = skills[0].name
      }

      // Get fighter type info - handle both regular and custom fighters
      const { data: fighterTypeData } = await supabase
        .from('fighters')
        .select(`
          fighter_type_id,
          custom_fighter_type_id,
          fighter_types(id, free_skill),
          custom_fighter_types(id, free_skill)
        `)
        .eq('id', params.fighter_id)
        .single();

      let fighterType = null;
      if (fighterTypeData?.fighter_types) {
        fighterType = Array.isArray(fighterTypeData.fighter_types)
          ? fighterTypeData.fighter_types[0]
          : fighterTypeData.fighter_types;
      } else if (fighterTypeData?.custom_fighter_types) {
        fighterType = Array.isArray(fighterTypeData.custom_fighter_types)
          ? fighterTypeData.custom_fighter_types[0]
          : fighterTypeData.custom_fighter_types;
      }

      // Delete skill-created effects before deleting the skill
      const {data: skillEffectTypes} = await supabase
        .from('fighter_effect_types')
        .select('id')
        .eq('type_specific_data->>skill_id', skillData.skill_id);

      if (skillEffectTypes && skillEffectTypes.length > 0) {
        await supabase
          .from('fighter_effects')
          .delete()
          .eq('fighter_id', params.fighter_id)
          .in('fighter_effect_type_id', skillEffectTypes.map(t => t.id));

        // Invalidate effect cache since we deleted effects
        invalidateFighterAdvancement({
          fighterId: params.fighter_id,
          gangId: fighter.gang_id,
          advancementType: 'effect'
        });
      }

      // Delete the skill
      const { error: deleteError } = await supabase
        .from('fighter_skills')
        .delete()
        .eq('id', params.advancement_id);

      if (deleteError) {
        return { success: false, error: 'Failed to delete skill' };
      }

      // Update free_skill status for both standard and custom fighter types
      if (fighterType) {
        const isCustom = !fighterTypeData?.fighter_type_id && !!fighterTypeData?.custom_fighter_type_id;
        const typeId = fighterTypeData?.fighter_type_id || fighterTypeData?.custom_fighter_type_id;

        if (typeId) {
          // Count default skills for this fighter type
          const { count: defaultSkillCount } = await supabase
            .from('fighter_defaults')
            .select('*', { count: 'exact', head: true })
            .eq(isCustom ? 'custom_fighter_type_id' : 'fighter_type_id', typeId)
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
            .eq(isCustom ? 'custom_fighter_type_id' : 'fighter_type_id', typeId)
            .eq('skill_id', skillData.skill_id);

          // Determine free_skill status
          // If fighter type has free_skill = true AND remaining skills <= default skills AND deleted skill was NOT default
          newFreeSkillStatus = fighterType.free_skill &&
                              (remainingSkillCount || 0) <= (defaultSkillCount || 0) &&
                              (wasDefaultSkill || 0) === 0;
        }
      }

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

      // Extract XP cost and credits_increase from type_specific_data
      if (effectData.type_specific_data && typeof effectData.type_specific_data === 'object') {
        const typeData = effectData.type_specific_data as any;
        xpToRefund = typeData.xp_cost || 0;
        ratingDelta -= (typeData.credits_increase || 0);
      }

      // Get the effect details before deleting to know which characteristic to decrease
      const { data: effectDetails, error: effectDetailsError } = await supabase
        .from('fighter_effects')
        .select('effect_name, fighter_effect_modifiers(stat_name)')
        .eq('id', params.advancement_id)
        .single();

      if (effectDetails && effectDetails.effect_name) {
        deletedEffectName = effectDetails.effect_name;
      }

      if (effectDetailsError || !effectDetails) {
        return { success: false, error: 'Failed to get effect details' };
      }

      // Delete the effect (this will cascade delete the modifiers)
      const { error: deleteError } = await supabase
        .from('fighter_effects')
        .delete()
        .eq('id', params.advancement_id);

      if (deleteError) {
        return { success: false, error: 'Failed to delete effect' };
      }

      // Characteristic changes are handled by effect modifiers only
      // No need to update base fighter characteristics

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

    // Update gang rating and wealth (apply ratingDelta which is negative when deleting)
    if (ratingDelta !== 0) {
      try {
        const { data: gangRow } = await supabase
          .from('gangs')
          .select('rating, wealth')
          .eq('id', fighter.gang_id)
          .single();
        const currentRating = (gangRow?.rating ?? 0) as number;
        const currentWealth = (gangRow?.wealth ?? 0) as number;
        const wealthDelta = ratingDelta; // No credits change, wealth mirrors rating change
        await supabase
          .from('gangs')
          .update({
            rating: Math.max(0, currentRating + ratingDelta),
            wealth: Math.max(0, currentWealth + wealthDelta)
          })
          .eq('id', fighter.gang_id);
        invalidateGangRating(fighter.gang_id);
      } catch (e) {
        console.error('Failed to update gang rating and wealth after advancement deletion:', e);
      }
    }

    // Invalidate fighter cache
    invalidateFighterData(params.fighter_id, fighter.gang_id);
    
    // If this is a beast fighter, also invalidate owner's cache
    await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase);


    let advancementName = deletedSkillName ? deletedSkillName : deletedEffectName
    // Log the advancement deletion
    await logSkillAdvancementDeletion({
      gang_id: fighter.gang_id,
      fighter_id: params.fighter_id,
      fighter_name: fighter.fighter_name,
      advancement_name: advancementName || 'Unknown Effect/Skill name',
      advancement_type: params.advancement_type,
      xp_refunded: xpToRefund,
      new_xp_total: updatedFighter.xp,
      include_gang_rating: true
    });

    // Invalidate cache for fighter advancement
    invalidateFighterAdvancement({
      fighterId: params.fighter_id,
      gangId: fighter.gang_id,
      advancementType: params.advancement_type === 'skill' ? 'skill' : 'effect'
    });

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