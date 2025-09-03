'use server'

import { createClient } from "@/utils/supabase/server";
import { getAuthenticatedUser, checkAdminOptimized } from "@/utils/auth";
// Logging functions removed - will be handled by TanStack Query invalidation

// Type-safe server function patterns for Next.js + TanStack Query integration
export type ServerFunctionResult<T = unknown> = {
  success: true
  data: T
} | {
  success: false
  error: string
}

export interface ServerFunctionContext {
  user: any  // AuthUser type from supabase
  supabase: any
}

// Helper function to create server function context
async function createServerContext(): Promise<ServerFunctionContext> {
  const supabase = await createClient()
  const user = await getAuthenticatedUser(supabase)
  
  return {
    user,
    supabase
  }
}

// Helper function to invalidate owner's cache when beast fighter is updated
async function invalidateBeastOwnerCache(fighterId: string, gangId: string, supabase: any) {
  // Check if this fighter is an exotic beast owned by another fighter
  const { data: ownerData } = await supabase
    .from('fighter_exotic_beasts')
    .select('fighter_owner_id')
    .eq('fighter_pet_id', fighterId)
    .single();
    
  if (ownerData) {
    // Cache invalidation now handled by TanStack Query client-side
    // Invalidate the owner's cache since their total cost changed
    // invalidateFighterData(ownerData.fighter_owner_id, gangId);
  }
}

// Interfaces
export interface AddSkillParams {
  fighter_id: string;
  skill_id: string;
  skill_name?: string;
  xp_cost: number;
  credits_increase: number;
  is_advance?: boolean;
}

export interface DeleteSkillParams {
  fighter_id: string;
  skill_advancement_id: string;
}

export interface SkillResult {
  fighter: {
    id: string;
    xp: number;
    free_skill?: boolean;
  };
  skill?: {
    id: string;
    name: string;
    credits_increase: number;
  };
  remaining_xp?: number;
}

export async function addFighterSkill(params: AddSkillParams): Promise<ServerFunctionResult<SkillResult>> {
  try {
    const { user, supabase } = await createServerContext();

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

    // Update gang rating (+credits_increase)
    try {
      const { data: ratingRow } = await supabase
        .from('gangs')
        .select('rating')
        .eq('id', fighter.gang_id)
        .single();
      const currentRating = (ratingRow?.rating ?? 0) as number;
      await supabase
        .from('gangs')
        .update({ rating: Math.max(0, currentRating + (params.credits_increase || 0)) })
        .eq('id', fighter.gang_id);
    } catch (e) {
      console.error('Failed to update gang rating after skill advancement:', e);
    }

    // If this is a beast fighter, also invalidate owner's cache
    await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase);

    return {
      success: true,
      data: {
        fighter: updatedFighter,
        skill: {
          id: insertedSkill.id,
          name: params.skill_name || 'Unknown Skill',
          credits_increase: params.credits_increase
        },
        remaining_xp: updatedFighter.xp
      }
    };

  } catch (error) {
    console.error('Error adding skill advancement:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
}

export async function deleteFighterSkill(params: DeleteSkillParams): Promise<ServerFunctionResult<SkillResult>> {
  try {
    const { user, supabase } = await createServerContext();

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

    // Check permissions - if not admin, must be fighter owner
    if (!isAdmin && fighter.user_id !== user.id) {
      return { success: false, error: 'Access denied' };
    }

    // Check if skill exists and get skill data including credits_increase
    const { data: skillData, error: skillError } = await supabase
      .from('fighter_skills')
      .select('id, fighter_id, skill_id, xp_cost, credits_increase, is_advance')
      .eq('id', params.skill_advancement_id)
      .single();

    if (skillError || !skillData) {
      return { success: false, error: 'Skill not found' };
    }

    if (skillData.fighter_id !== params.fighter_id) {
      return { success: false, error: 'Skill does not belong to this fighter' };
    }

    const xpToRefund = skillData.xp_cost || 0;
    const ratingDelta = -(skillData.credits_increase || 0);

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

    // Get skill name for response
    const { data: skillInfo } = await supabase
      .from('skills')
      .select('name')
      .eq('id', skillData.skill_id)
      .single();

    // Delete the skill
    const { error: deleteError } = await supabase
      .from('fighter_skills')
      .delete()
      .eq('id', params.skill_advancement_id);

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

    let newFreeSkillStatus = fighter.free_skill;

    // Set free_skill to true if:
    // 1. Fighter type has free skills (fighterType.free_skill is true)
    // 2. The deleted skill was a default skill (wasDefaultSkill > 0)
    // 3. After deletion, the fighter has fewer skills than default skills required
    if (fighterType.free_skill && wasDefaultSkill && wasDefaultSkill > 0 && (remainingSkillCount || 0) < (defaultSkillCount || 0)) {
      newFreeSkillStatus = true;
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
      .select('id, xp, free_skill')
      .single();

    if (updateError || !updatedFighter) {
      return { success: false, error: 'Failed to update fighter' };
    }

    // Update gang rating (-credits_increase)
    try {
      const { data: ratingRow } = await supabase
        .from('gangs')
        .select('rating')
        .eq('id', fighter.gang_id)
        .single();
      const currentRating = (ratingRow?.rating ?? 0) as number;
      await supabase
        .from('gangs')
        .update({ rating: Math.max(0, currentRating + ratingDelta) })
        .eq('id', fighter.gang_id);
    } catch (e) {
      console.error('Failed to update gang rating after skill deletion:', e);
    }

    // If this is a beast fighter, also invalidate owner's cache
    await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase);

    return {
      success: true,
      data: {
        fighter: updatedFighter,
        skill: {
          id: skillData.id,
          name: skillInfo?.name || 'Unknown Skill',
          credits_increase: skillData.credits_increase || 0
        },
        remaining_xp: updatedFighter.xp
      }
    };

  } catch (error) {
    console.error('Error deleting skill advancement:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
}