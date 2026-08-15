'use server';

import { createClient } from '@/utils/supabase/server';
import { invalidateFighterData, invalidateFighterAdvancement, CACHE_TAGS, invalidateGangCredits, invalidateUserGangsList } from '@/utils/cache-tags';
import { getAuthenticatedUser } from '@/utils/auth';
import { revalidateTag } from 'next/cache';
import { updateGangRatingSimple, updateGangFinancials } from '@/utils/gang-rating-and-wealth';
import { countsTowardRating } from '@/utils/fighter-status';
import {
  hasChampionLeaderTypePromotion,
  hasCumulativeXp,
  hasGangerChampionKeepTypePromotion,
  hasProspectSpecialisationPromotion,
} from '@/types/edition';
import {
  N26_CHAMPION_PROMOTION_SKILL_ID,
  N26_CHAMPION_PROMOTION_SKILL_NAME,
  N26_PROSPECT_PROMOTION_CREDITS,
  buildN26ChampionLeaderDemotionSubtypes,
  buildN26ChampionLeaderPromotionSubtypes,
  buildN26GangerChampionDemotionSubtypes,
  buildN26GangerChampionPromotionSubtypes,
  buildN26ProspectDemotionSubtypes,
  buildN26ProspectPromotionSubtypes,
  getN26ProspectSpecialisation,
  isN26GangerChampionPromotionSkillGrant,
  isN26LeaderPromotionSkillGrant,
  isN26ProspectPromotionSkillBlockedByHigherRank,
  isN26ProspectPromotionUndoCandidate,
} from '@/utils/keepTypePromotionN26';

import { 
  logCharacteristicAdvancement, 
  logSkillAdvancement, 
  logSkillAdvancementDeletion,
  logRolledGangerAdvancement,
  logRolledSkillAdvancement
} from './logs/gang-fighter-logs';
import type { GangLogActionResult } from './logs/gang-logs';
import { updateFighterDetails } from './edit-fighter';

// A fighter's edition comes from its gang's (custom) gang type.
const GANG_EDITION_EMBED = `
  gangs!gang_id (
    gang_types!gang_type_id ( editions:edition_id ( slug ) ),
    custom_gang_types!custom_gang_type_id ( editions:edition_id ( slug ) )
  )
`;

// Whether an Advancement costs XP is edition-specific, so every action that
// touches a fighter's XP balance loads the edition alongside the fighter.
const FIGHTER_WITH_EDITION_SELECT = `
  id, user_id, gang_id, xp, starting_xp, free_skill, fighter_name, killed, retired, enslaved, captured,
  ${GANG_EDITION_EMBED}
`;

// The roll loggers need the edition too, but none of the XP balance.
const ROLL_LOGGER_FIGHTER_SELECT = `
  id, gang_id, fighter_name, fighter_subtypes,
  ${GANG_EDITION_EMBED}
`;

// Embeds come back as objects for these many-to-one FKs; the untyped client
// infers arrays, hence the casts (same pattern as equipment.ts).
function editionSlugOf(fighter: any): string | null {
  const gang = fighter.gangs as any;
  return gang?.gang_types?.editions?.slug
    ?? gang?.custom_gang_types?.editions?.slug
    ?? null;
}

/**
 * Whether the fighter may take another Advancement right now.
 *
 * N23 buys Advancements with XP and so can be short of it. N26 earns them by
 * rank, and that rank is not enforced: groups decide between themselves when a
 * model may advance, and the app records the decision rather than refusing it.
 * Returns an error message, or null when the Advancement may proceed.
 */
function advancementBlockedReason(
  fighter: any,
  spendsXp: boolean,
  xpCost: number,
): string | null {
  return spendsXp && fighter.xp < xpCost ? 'Insufficient XP' : null;
}

// Type for power boost type_specific_data
interface PowerBoostTypeData {
  kill_cost?: number;
  credits_increase?: number;
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
    // Invalidate the owner's cache since their total cost changed
    invalidateFighterData(ownerData.fighter_owner_id, gangId);

    // Invalidate the owner's beast costs cache
    // Without this, the owner's cost calculation uses stale beast data
    revalidateTag(CACHE_TAGS.COMPUTED_FIGHTER_BEAST_COSTS(ownerData.fighter_owner_id), { expire: 0 });
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
  skill_id?: string;
  custom_skill_id?: string;
  xp_cost: number;
  /** Added to gang rating. When is_advance is false (direct purchase), also deducted from gang stash. */
  credits_increase: number;
  is_advance?: boolean;
}

/**
 * Server-only options for {@link addSkillAdvancementInternal}. Never expose on
 * the exported `addSkillAdvancement` action params — clients must not set these.
 */
type AddSkillAdvancementInternalOptions = {
  /**
   * When true with is_advance false: increase rating without deducting stash,
   * and do not clear free_skill. Used for N26 keep-type promotion grants.
   */
  ratingOnly?: boolean;
};

export interface PromotionWithSkillAdvancementParams {
  fighter_id: string;
  skill_id: string;
  xp_cost: number;
  credits_increase: number;
  promotion: {
    fighter_type: string;
    fighter_type_id: string;
    fighter_subtypes: string[];
    special_rules: string[];
    fighter_specialisation?: string | null;
    fighter_specialisation_id?: string | null;
  };
}

export interface N26ProspectPromotionParams {
  fighter_id: string;
  fighter_specialisation_id: string;
  special_rules?: string[];
}

export interface N26GangerChampionPromotionParams {
  fighter_id: string;
  special_rules?: string[];
}

export interface N26ChampionLeaderPromotionParams {
  fighter_id: string;
  fighter_type_id: string;
  special_rules?: string[];
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
    /** fighter_skills.id when a skill was inserted */
    id?: string;
  };
  remaining_xp?: number;
  /**
   * When deleting an N26 keep-type promotion skill, the demoted fighter details
   * so the client can patch local state without a full reload.
   */
  fighter_details?: {
    fighter_subtypes: string[];
    fighter_specialisation: string | null;
    fighter_specialisation_id: string | null;
    special_rules: string[];
  };
  /** False when rating changed without a stash refund (e.g. Prospect promotion undo). */
  refund_stash?: boolean;
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

    // Verify fighter ownership and get fighter data
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select(FIGHTER_WITH_EDITION_SELECT)
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      return { success: false, error: 'Fighter not found' };
    }

    // Note: Authorization is enforced by RLS policies on fighters table

    // N26 earns Advancements by reaching a rank rather than buying them, so its
    // XP total only ever grows and there is nothing to afford.
    const spendsXp = !hasCumulativeXp(editionSlugOf(fighter));

    const blockedReason = advancementBlockedReason(fighter, spendsXp, params.xp_cost);
    if (blockedReason) {
      return { success: false, error: blockedReason };
    }

    // Get the effect type details
    const { data: effectType, error: effectTypeError } = await supabase
      .from('fighter_effect_types')
      .select('id, effect_name, type_specific_data, sort_order')
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

    // Insert the new advancement as a fighter effect with fighter owner's user_id
    const { data: insertedEffect, error: insertError } = await supabase
      .from('fighter_effects')
      .insert({
        fighter_id: params.fighter_id,
        fighter_effect_type_id: params.fighter_effect_type_id,
        effect_name: effectType.effect_name,
        type_specific_data: mergedTypeData,
        sort_order: effectType.sort_order ?? null,
        user_id: fighter.user_id
      })
      .select('id')
      .single();

    if (insertError || !insertedEffect) {
      return { success: false, error: 'Failed to insert fighter effect' };
    }

    // Get the template modifier details
    const { data: modifierTemplate, error: modifierError } = await supabase
      .from('fighter_effect_type_modifiers')
      .select('id, default_numeric_value, operation')
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
        numeric_value: modifierTemplate.default_numeric_value,
        operation: modifierTemplate.operation || 'add'
      });

    if (modifierInsertError) {
      return { success: false, error: 'Failed to insert effect modifier' };
    }

    // Update fighter's XP only (characteristic is handled by effect modifiers)
    const { data: updatedFighter, error: updateError } = await supabase
      .from('fighters')
      .update({
        xp: spendsXp ? fighter.xp - params.xp_cost : fighter.xp,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.fighter_id)
      .select('id, xp')
      .single();

    if (updateError || !updatedFighter) {
      return { success: false, error: 'Failed to update fighter XP' };
    }

    // Update gang rating and wealth (+credits_increase) — only for active fighters
    if (countsTowardRating(fighter)) {
      await updateGangRatingSimple(supabase, fighter.gang_id, params.credits_increase || 0);
    }

    // Invalidate fighter cache
    invalidateFighterData(params.fighter_id, fighter.gang_id);

    // Home page gangs list cache (server-side, user-scoped)
    invalidateUserGangsList(fighter.user_id);
    
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
      include_gang_rating: true,
      spends_xp: spendsXp
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
  return addSkillAdvancementInternal(params);
}

/**
 * Internal skill grant. Accepts server-only options that must never be part of
 * the exported action's public params (clients can invent any field on the
 * exported action).
 */
async function addSkillAdvancementInternal(
  params: AddSkillAdvancementParams & AddSkillAdvancementInternalOptions
): Promise<AdvancementResult> {
  try {
    if (!params.skill_id && !params.custom_skill_id) {
      return { success: false, error: 'Either skill_id or custom_skill_id must be provided' };
    }

    const supabase = await createClient();
    
    // Check authentication with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Verify fighter ownership and get fighter data
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select(FIGHTER_WITH_EDITION_SELECT)
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      return { success: false, error: 'Fighter not found' };
    }

    // Note: Authorization is enforced by RLS policies on fighters table

    // N26 earns Advancements by reaching a rank rather than buying them, so its
    // XP total only ever grows and there is nothing to afford.
    const spendsXp = !hasCumulativeXp(editionSlugOf(fighter));

    const blockedReason = advancementBlockedReason(fighter, spendsXp, params.xp_cost);
    if (blockedReason) {
      return { success: false, error: blockedReason };
    }

    // Insert the new skill advancement with fighter owner's user_id
    const insertData = {
      fighter_id: params.fighter_id,
      credits_increase: params.credits_increase,
      xp_cost: params.xp_cost,
      is_advance: params.is_advance ?? true,
      user_id: fighter.user_id,
      updated_at: new Date().toISOString(),
      ...(params.skill_id ? { skill_id: params.skill_id } : {}),
      ...(params.custom_skill_id ? { custom_skill_id: params.custom_skill_id } : {}),
    };

    const { data: insertedSkill, error: insertError } = await supabase
      .from('fighter_skills')
      .insert(insertData)
      .select('id, fighter_id, skill_id, custom_skill_id, credits_increase, xp_cost, is_advance')
      .single();

    if (insertError || !insertedSkill) {
      console.error('Database insert error:', insertError);
      return {
        success: false,
        error: insertError?.message || 'Failed to insert fighter skill'
      };
    }

    // Create skill-linked fighter effects (if any effect types reference this skill)
    let createdSkillEffects = false;
    if (params.skill_id || params.custom_skill_id) {
      // Query effect types linked to this skill
      const skillFilterColumn = params.skill_id
        ? 'type_specific_data->>skill_id'
        : 'type_specific_data->>custom_skill_id';
      const skillFilterValue = (params.skill_id || params.custom_skill_id)!;

      const { data: linkedEffectTypes } = await supabase
        .from('fighter_effect_types')
        .select('id, effect_name, type_specific_data, sort_order, fighter_effect_categories!inner(category_name)')
        .eq(skillFilterColumn, skillFilterValue)
        .eq('fighter_effect_categories.category_name', 'skills');

      if (linkedEffectTypes && linkedEffectTypes.length > 0) {
        for (const effectType of linkedEffectTypes) {
          // Insert fighter_effects row linked to the skill
          const { data: insertedEffect, error: effectInsertError } = await supabase
            .from('fighter_effects')
            .insert({
              fighter_id: params.fighter_id,
              fighter_effect_type_id: effectType.id,
              effect_name: effectType.effect_name,
              type_specific_data: effectType.type_specific_data,
              sort_order: effectType.sort_order ?? null,
              fighter_skill_id: insertedSkill.id,
              user_id: fighter.user_id
            })
            .select('id')
            .single();

          if (effectInsertError || !insertedEffect) {
            console.error('Failed to insert skill-linked effect:', effectInsertError);
            continue;
          }

          // Query and insert modifiers for this effect type
          const { data: modifierTemplates } = await supabase
            .from('fighter_effect_type_modifiers')
            .select('stat_name, default_numeric_value, operation')
            .eq('fighter_effect_type_id', effectType.id);

          if (modifierTemplates && modifierTemplates.length > 0) {
            const modifiersToInsert = modifierTemplates.map(template => ({
              fighter_effect_id: insertedEffect.id,
              stat_name: template.stat_name,
              numeric_value: template.default_numeric_value,
              operation: template.operation || 'add'
            }));

            await supabase
              .from('fighter_effect_modifiers')
              .insert(modifiersToInsert);
          }

          createdSkillEffects = true;
        }
      }
    }

    // Update fighter's XP and conditionally set free_skill to false
    const updateData: any = {
      xp: spendsXp ? fighter.xp - params.xp_cost : fighter.xp,
      updated_at: new Date().toISOString()
    };
    
    const isAdvance = params.is_advance ?? true;
    const ratingOnly = Boolean(params.ratingOnly);

    // Set free_skill to false only for regular skills (is_advance: false) when fighter currently has free_skill: true (missing starting skill)
    // Do NOT set free_skill to false for advancement skills (is_advance: true) as those are purchased with XP, not starting skills
    // ratingOnly grants (N26 Prospect promotion) also leave free_skill alone
    if (!isAdvance && !ratingOnly && fighter.free_skill) {
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

    // Update gang rating and wealth. We capture the before/after snapshots so the
    // gang log can render a "Gang Rating: A → B | Wealth: C → D" line.
    const creditsIncrease = params.credits_increase || 0;
    let financialsBefore: { rating: number; wealth: number } | undefined;
    let financialsAfter: { rating: number; wealth: number } | undefined;
    if (creditsIncrease > 0) {
      if (isAdvance || ratingOnly) {
        // Advancement / rating-only grant: only increase rating, no stash deduction
        if (countsTowardRating(fighter)) {
          const result = await updateGangRatingSimple(supabase, fighter.gang_id, creditsIncrease);
          if (result.oldValues && result.newValues) {
            financialsBefore = { rating: result.oldValues.rating, wealth: result.oldValues.wealth };
            financialsAfter = { rating: result.newValues.rating, wealth: result.newValues.wealth };
          }
        }
      } else {
        // Direct purchase: verify gang has sufficient credits before deducting
        const { data: gang, error: gangError } = await supabase
          .from('gangs')
          .select('credits')
          .eq('id', fighter.gang_id)
          .single();

        if (gangError || !gang) {
          return { success: false, error: 'Failed to verify gang credits' };
        }

        if (gang.credits < creditsIncrease) {
          return { success: false, error: 'Insufficient gang credits' };
        }

        // Starting skill path (direct purchase): deduct from stash AND increase rating
        const result = await updateGangFinancials(supabase, {
          gangId: fighter.gang_id,
          ratingDelta: countsTowardRating(fighter) ? creditsIncrease : 0,
          creditsDelta: -creditsIncrease
        });
        if (result.oldValues && result.newValues) {
          financialsBefore = { rating: result.oldValues.rating, wealth: result.oldValues.wealth };
          financialsAfter = { rating: result.newValues.rating, wealth: result.newValues.wealth };
        }
        invalidateGangCredits(fighter.gang_id);
      }

      // Home page gangs list cache (server-side, user-scoped)
      invalidateUserGangsList(fighter.user_id);
    }

    // Invalidate fighter cache
    invalidateFighterData(params.fighter_id, fighter.gang_id);

    // If this is a beast fighter, also invalidate owner's cache
    await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase);

    // Get skill name for logging
    let skillName = 'Unknown Skill';
    if (params.skill_id) {
      const { data: skillData } = await supabase
        .from('skills')
        .select('name')
        .eq('id', params.skill_id)
        .single();
      skillName = skillData?.name || skillName;
    } else if (params.custom_skill_id) {
      const { data: customSkillData } = await supabase
        .from('custom_skills')
        .select('skill_name')
        .eq('id', params.custom_skill_id)
        .single();
      skillName = customSkillData?.skill_name || skillName;
    }

    // Log the skill advancement
    await logSkillAdvancement({
      gang_id: fighter.gang_id,
      fighter_id: params.fighter_id,
      fighter_name: fighter.fighter_name,
      skill_name: skillName,
      xp_cost: params.xp_cost,
      credits_increase: params.credits_increase,
      remaining_xp: updatedFighter.xp,
      is_advance: isAdvance,
      spends_xp: spendsXp,
      ...(financialsBefore && financialsAfter
        ? { gang_financials_before: financialsBefore, gang_financials_after: financialsAfter }
        : {}),
      ...(!isAdvance && !ratingOnly && creditsIncrease > 0 ? { credits_deducted: creditsIncrease } : {})
    });

    // Invalidate cache for fighter advancement
    invalidateFighterAdvancement({
      fighterId: params.fighter_id,
      gangId: fighter.gang_id,
      advancementType: 'skill'
    });

    // Also invalidate effect cache if skill-linked effects were created
    if (createdSkillEffects) {
      invalidateFighterAdvancement({
        fighterId: params.fighter_id,
        gangId: fighter.gang_id,
        advancementType: 'effect'
      });
    }

    return {
      success: true,
      fighter: updatedFighter,
      advancement: {
        credits_increase: params.credits_increase,
        id: insertedSkill.id,
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

/**
 * Promotes a fighter and adds a skill advancement as one logical operation.
 * If the skill step fails after promotion succeeds, the fighter's subtype/type is reverted.
 */
export async function applyPromotionWithSkillAdvancement(
  params: PromotionWithSkillAdvancementParams
): Promise<AdvancementResult> {
  try {
    const supabase = await createClient();
    const { data: before, error: beforeError } = await supabase
      .from('fighters')
      .select('fighter_subtypes, fighter_type, fighter_type_id, fighter_specialisation, fighter_specialisation_id, special_rules')
      .eq('id', params.fighter_id)
      .single();

    if (beforeError || !before) {
      return { success: false, error: 'Fighter not found' };
    }

    const promotionResult = await updateFighterDetails({
      fighter_id: params.fighter_id,
      fighter_subtypes: params.promotion.fighter_subtypes,
      fighter_type: params.promotion.fighter_type,
      fighter_type_id: params.promotion.fighter_type_id,
      fighter_specialisation: params.promotion.fighter_specialisation ?? null,
      fighter_specialisation_id: params.promotion.fighter_specialisation_id ?? null,
      special_rules: params.promotion.special_rules
    });

    if (!promotionResult.success) {
      return { success: false, error: promotionResult.error || 'Failed to promote fighter' };
    }

    const skillResult = await addSkillAdvancement({
      fighter_id: params.fighter_id,
      skill_id: params.skill_id,
      xp_cost: params.xp_cost,
      credits_increase: params.credits_increase,
      is_advance: true
    });

    if (!skillResult.success) {
      const revertResult = await updateFighterDetails({
        fighter_id: params.fighter_id,
        fighter_subtypes: before.fighter_subtypes ?? undefined,
        fighter_type: before.fighter_type ?? undefined,
        fighter_type_id: before.fighter_type_id ?? undefined,
        fighter_specialisation: before.fighter_specialisation ?? null,
        fighter_specialisation_id: before.fighter_specialisation_id ?? null,
        special_rules: before.special_rules ?? []
      });

      if (!revertResult.success) {
        return {
          success: false,
          error: `${skillResult.error}. Promotion could not be reverted automatically — please check this fighter's subtype and type in Edit Fighter.`
        };
      }

      return { success: false, error: skillResult.error || 'Failed to add skill' };
    }

    return skillResult;
  } catch (error) {
    console.error('Error applying promotion with skill advancement:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

type KeepTypePromotionFighterSnapshot = {
  fighter_subtypes: string[] | null;
  fighter_type: string | null;
  fighter_type_id: string | null;
  fighter_specialisation: string | null;
  fighter_specialisation_id: string | null;
  special_rules: string[] | null;
};

const KEEP_TYPE_PROMOTION_FIGHTER_SELECT = `
  id, user_id, gang_id,
  fighter_subtypes, fighter_type, fighter_type_id,
  fighter_specialisation, fighter_specialisation_id, special_rules,
  ${GANG_EDITION_EMBED}
`;

/** Resolve a catalog skill by preferred id, falling back to unique name match. */
async function resolveCatalogSkillId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  preferredSkillId: string,
  skillName: string
): Promise<{ skillId: string } | { error: string }> {
  const { data: preferredSkill } = await supabase
    .from('skills')
    .select('id, name')
    .eq('id', preferredSkillId)
    .maybeSingle();

  if (preferredSkill && preferredSkill.name === skillName) {
    return { skillId: preferredSkill.id };
  }

  const { data: skillsByName, error: skillLookupError } = await supabase
    .from('skills')
    .select('id, name')
    .eq('name', skillName);

  if (skillLookupError || !skillsByName?.length) {
    return { error: `Could not resolve skill "${skillName}"` };
  }
  if (skillsByName.length > 1) {
    return {
      error: `Ambiguous skill name "${skillName}" — expected a single catalog match`,
    };
  }
  return { skillId: skillsByName[0].id };
}

async function fighterAlreadyHasSkill(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fighterId: string,
  skillId: string,
  skillName: string
): Promise<boolean> {
  const [{ data: existingBySkillId }, { data: existingByName }, { data: existingCustomByName }] =
    await Promise.all([
      supabase
        .from('fighter_skills')
        .select('id')
        .eq('fighter_id', fighterId)
        .eq('skill_id', skillId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('fighter_skills')
        .select('id, skills!inner(name)')
        .eq('fighter_id', fighterId)
        .eq('skills.name', skillName)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('fighter_skills')
        .select('id, custom_skills!inner(skill_name)')
        .eq('fighter_id', fighterId)
        .eq('custom_skills.skill_name', skillName)
        .limit(1)
        .maybeSingle(),
    ]);

  return Boolean(existingBySkillId || existingByName || existingCustomByName);
}

/**
 * Shared N26 promotion path: update fighter details, optionally grant a
 * non-Advancement skill (ratingOnly), revert details if the skill grant fails.
 */
async function applyKeepTypePromotionWithSkillGrant(args: {
  fighterId: string;
  before: KeepTypePromotionFighterSnapshot;
  newSubtypes: string[];
  specialRules: string[];
  fighterSpecialisation?: string | null;
  fighterSpecialisationId?: string | null;
  /** When set, overrides before.fighter_type (Champion→Leader type change). */
  fighterType?: string | null;
  /** When set, overrides before.fighter_type_id. */
  fighterTypeId?: string | null;
  /** Omit to update details only (e.g. Inspiring already present). */
  skillId?: string;
  creditsIncrease: number;
}): Promise<AdvancementResult> {
  const nextFighterType =
    args.fighterType !== undefined ? args.fighterType : args.before.fighter_type;
  const nextFighterTypeId =
    args.fighterTypeId !== undefined ? args.fighterTypeId : args.before.fighter_type_id;

  const promotionResult = await updateFighterDetails({
    fighter_id: args.fighterId,
    fighter_subtypes: args.newSubtypes,
    fighter_type: nextFighterType ?? undefined,
    fighter_type_id: nextFighterTypeId ?? undefined,
    fighter_specialisation:
      args.fighterSpecialisation !== undefined
        ? args.fighterSpecialisation
        : (args.before.fighter_specialisation ?? null),
    fighter_specialisation_id:
      args.fighterSpecialisationId !== undefined
        ? args.fighterSpecialisationId
        : (args.before.fighter_specialisation_id ?? null),
    special_rules: args.specialRules,
  });

  if (!promotionResult.success) {
    return { success: false, error: promotionResult.error || 'Failed to promote fighter' };
  }

  if (!args.skillId) {
    return { success: true };
  }

  // Not an Advancement: is_advance false so it does not consume a rank slot.
  // ratingOnly: rating delta without stash deduction (internal option only).
  const skillResult = await addSkillAdvancementInternal({
    fighter_id: args.fighterId,
    skill_id: args.skillId,
    xp_cost: 0,
    credits_increase: args.creditsIncrease,
    is_advance: false,
    ratingOnly: true,
  });

  if (!skillResult.success) {
    const revertResult = await updateFighterDetails({
      fighter_id: args.fighterId,
      fighter_subtypes: args.before.fighter_subtypes ?? undefined,
      fighter_type: args.before.fighter_type ?? undefined,
      fighter_type_id: args.before.fighter_type_id ?? undefined,
      fighter_specialisation: args.before.fighter_specialisation ?? null,
      fighter_specialisation_id: args.before.fighter_specialisation_id ?? null,
      special_rules: args.before.special_rules ?? [],
    });

    if (!revertResult.success) {
      return {
        success: false,
        error: `${skillResult.error}. Promotion could not be reverted automatically — please check this fighter in Edit Fighter.`,
      };
    }

    return { success: false, error: skillResult.error || 'Failed to add skill' };
  }

  return {
    success: true,
    fighter: skillResult.fighter,
    advancement: {
      credits_increase: args.creditsIncrease,
      id: skillResult.advancement?.id,
    },
    remaining_xp: skillResult.remaining_xp,
  };
}

/**
 * N26-only: promote a Prospect without changing fighter type.
 * Removes Prospect, adds Ganger + Specialist, sets specialisation, and grants the
 * specialisation skill with +15 credits_increase (rating only).
 * The grant is not an Advancement (is_advance: false), so it does not consume an
 * N26 rank slot; rating-only financials avoid a stash deduction.
 */
export async function applyN26ProspectPromotion(
  params: N26ProspectPromotionParams
): Promise<AdvancementResult> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const specialisation = getN26ProspectSpecialisation(params.fighter_specialisation_id);
    if (!specialisation) {
      return { success: false, error: 'Invalid specialisation for Prospect promotion' };
    }

    const { data: before, error: beforeError } = await supabase
      .from('fighters')
      .select(KEEP_TYPE_PROMOTION_FIGHTER_SELECT)
      .eq('id', params.fighter_id)
      .single();

    if (beforeError || !before) {
      return { success: false, error: 'Fighter not found' };
    }

    const editionSlug = editionSlugOf(before);
    if (!hasProspectSpecialisationPromotion(editionSlug)) {
      return { success: false, error: 'Prospect specialisation promotion is not available for this edition' };
    }

    const currentSubtypes: string[] = Array.isArray(before.fighter_subtypes)
      ? before.fighter_subtypes
      : [];
    if (!currentSubtypes.includes('Prospect')) {
      return { success: false, error: 'Only Prospect fighters can use this promotion' };
    }

    const skillResolved = await resolveCatalogSkillId(
      supabase,
      specialisation.preferredSkillId,
      specialisation.skillName
    );
    if ('error' in skillResolved) {
      return {
        success: false,
        error: `${skillResolved.error} for ${specialisation.name}`,
      };
    }

    if (
      await fighterAlreadyHasSkill(
        supabase,
        params.fighter_id,
        skillResolved.skillId,
        specialisation.skillName
      )
    ) {
      return {
        success: false,
        error: `This fighter already has the skill ${specialisation.skillName}`,
      };
    }

    // Always rebuild subtypes server-side — never trust client-supplied lists.
    const newSubtypes = buildN26ProspectPromotionSubtypes(currentSubtypes);
    const specialRules =
      params.special_rules ??
      (Array.isArray(before.special_rules) ? before.special_rules : []);

    return await applyKeepTypePromotionWithSkillGrant({
      fighterId: params.fighter_id,
      before,
      newSubtypes,
      specialRules,
      fighterSpecialisation: specialisation.name,
      fighterSpecialisationId: specialisation.id,
      skillId: skillResolved.skillId,
      creditsIncrease: N26_PROSPECT_PROMOTION_CREDITS,
    });
  } catch (error) {
    console.error('Error applying N26 Prospect promotion:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * N26-only: promote a Ganger to Champion without changing fighter type.
 * Removes Ganger, adds Champion, grants Inspiring. Rating unchanged.
 * The grant is not an Advancement (is_advance: false).
 */
export async function applyN26GangerChampionPromotion(
  params: N26GangerChampionPromotionParams
): Promise<AdvancementResult> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const { data: before, error: beforeError } = await supabase
      .from('fighters')
      .select(KEEP_TYPE_PROMOTION_FIGHTER_SELECT)
      .eq('id', params.fighter_id)
      .single();

    if (beforeError || !before) {
      return { success: false, error: 'Fighter not found' };
    }

    const editionSlug = editionSlugOf(before);
    if (!hasGangerChampionKeepTypePromotion(editionSlug)) {
      return {
        success: false,
        error: 'Ganger to Champion keep-type promotion is not available for this edition',
      };
    }

    const currentSubtypes: string[] = Array.isArray(before.fighter_subtypes)
      ? before.fighter_subtypes
      : [];
    if (!currentSubtypes.includes('Ganger')) {
      return { success: false, error: 'Only Ganger fighters can use this promotion' };
    }
    if (currentSubtypes.includes('Champion')) {
      return { success: false, error: 'This fighter is already a Champion' };
    }

    const skillResolved = await resolveCatalogSkillId(
      supabase,
      N26_CHAMPION_PROMOTION_SKILL_ID,
      N26_CHAMPION_PROMOTION_SKILL_NAME
    );
    if ('error' in skillResolved) {
      return { success: false, error: skillResolved.error };
    }

    const alreadyHasInspiring = await fighterAlreadyHasSkill(
      supabase,
      params.fighter_id,
      skillResolved.skillId,
      N26_CHAMPION_PROMOTION_SKILL_NAME
    );

    // Always rebuild subtypes server-side — never trust client-supplied lists.
    const newSubtypes = buildN26GangerChampionPromotionSubtypes(currentSubtypes);
    const specialRules =
      params.special_rules ??
      (Array.isArray(before.special_rules) ? before.special_rules : []);

    return await applyKeepTypePromotionWithSkillGrant({
      fighterId: params.fighter_id,
      before,
      newSubtypes,
      specialRules,
      // Keep existing specialisation (if any); do not clear or overwrite.
      // Skip Inspiring grant when already owned — still promote (mirror Leader).
      skillId: alreadyHasInspiring ? undefined : skillResolved.skillId,
      creditsIncrease: 0,
    });
  } catch (error) {
    console.error('Error applying N26 Ganger→Champion promotion:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * N26-only: promote a Champion to Leader by selecting a Leader fighter type.
 * Rebuilds subtypes (drop Loner/Champion/Ganger/Prospect, add Leader), keeps
 * existing specialisation, grants Inspiring if missing. Rating unchanged.
 */
export async function applyN26ChampionLeaderPromotion(
  params: N26ChampionLeaderPromotionParams
): Promise<AdvancementResult> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    if (!params.fighter_type_id) {
      return { success: false, error: 'A Leader fighter type is required' };
    }

    const { data: before, error: beforeError } = await supabase
      .from('fighters')
      .select(KEEP_TYPE_PROMOTION_FIGHTER_SELECT)
      .eq('id', params.fighter_id)
      .single();

    if (beforeError || !before) {
      return { success: false, error: 'Fighter not found' };
    }

    const editionSlug = editionSlugOf(before);
    if (!hasChampionLeaderTypePromotion(editionSlug)) {
      return {
        success: false,
        error: 'Champion to Leader promotion is not available for this edition',
      };
    }

    const currentSubtypes: string[] = Array.isArray(before.fighter_subtypes)
      ? before.fighter_subtypes
      : [];
    if (!currentSubtypes.includes('Champion')) {
      return { success: false, error: 'Only Champion fighters can use this promotion' };
    }
    if (currentSubtypes.includes('Leader')) {
      return { success: false, error: 'This fighter is already a Leader' };
    }

    const { data: leaderType, error: leaderTypeError } = await supabase
      .from('fighter_types')
      .select('id, fighter_type, fighter_subtypes, editions:edition_id ( slug )')
      .eq('id', params.fighter_type_id)
      .maybeSingle();

    if (leaderTypeError || !leaderType) {
      return { success: false, error: 'Leader fighter type not found' };
    }

    const leaderEditionSlug = Array.isArray(leaderType.editions)
      ? leaderType.editions[0]?.slug
      : (leaderType.editions as { slug?: string } | null)?.slug;
    if (editionSlug && leaderEditionSlug && leaderEditionSlug !== editionSlug) {
      return { success: false, error: 'Selected fighter type is not available for this edition' };
    }

    const catalogSubtypes: string[] = Array.isArray(leaderType.fighter_subtypes)
      ? leaderType.fighter_subtypes
      : [];
    if (!catalogSubtypes.includes('Leader')) {
      return { success: false, error: 'Selected fighter type is not a Leader' };
    }

    const skillResolved = await resolveCatalogSkillId(
      supabase,
      N26_CHAMPION_PROMOTION_SKILL_ID,
      N26_CHAMPION_PROMOTION_SKILL_NAME
    );
    if ('error' in skillResolved) {
      return { success: false, error: skillResolved.error };
    }

    const alreadyHasInspiring = await fighterAlreadyHasSkill(
      supabase,
      params.fighter_id,
      skillResolved.skillId,
      N26_CHAMPION_PROMOTION_SKILL_NAME
    );

    // Always rebuild subtypes server-side — never trust client-supplied lists.
    const newSubtypes = buildN26ChampionLeaderPromotionSubtypes(currentSubtypes);
    const specialRules =
      params.special_rules ??
      (Array.isArray(before.special_rules) ? before.special_rules : []);

    return await applyKeepTypePromotionWithSkillGrant({
      fighterId: params.fighter_id,
      before,
      newSubtypes,
      specialRules,
      fighterType: leaderType.fighter_type,
      fighterTypeId: leaderType.id,
      // Keep existing specialisation (if any); do not clear or overwrite.
      skillId: alreadyHasInspiring ? undefined : skillResolved.skillId,
      creditsIncrease: 0,
    });
  } catch (error) {
    console.error('Error applying N26 Champion→Leader promotion:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
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

    // Verify fighter ownership
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select(`
        ${FIGHTER_WITH_EDITION_SELECT},
        fighter_subtypes, fighter_type, fighter_type_id,
        fighter_specialisation, fighter_specialisation_id, special_rules
      `)
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      return { success: false, error: 'Fighter not found' };
    }

    // Note: Authorization is enforced by RLS policies on fighters table

    // Nothing was spent on an N26 Advancement, so deleting one refunds nothing.
    const spendsXp = !hasCumulativeXp(editionSlugOf(fighter));

    let xpToRefund = 0;
    let ratingDelta = 0;
    let refundStash = false; // Whether to refund credits to gang stash (non-advancement skills)
    let newFreeSkillStatus = fighter.free_skill;
    let deletedSkillName: string = '';
    let deletedEffectName: string = '';
    let demotedFighterDetails: AdvancementResult['fighter_details'] | undefined;

    if (params.advancement_type === 'skill') {
      // Handle skill deletion
      
      // Check if skill exists and get skill data including credits_increase
      const { data: skillData, error: skillError } = await supabase
        .from('fighter_skills')
        .select('id, fighter_id, skill_id, custom_skill_id, xp_cost, credits_increase, is_advance')
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
      refundStash = !skillData.is_advance; // Non-advancement skills paid from stash, so refund on delete

      // Get skill name for logging
      if (skillData.custom_skill_id) {
        const { data: customSkillData } = await supabase
          .from('custom_skills')
          .select('skill_name')
          .eq('id', skillData.custom_skill_id)
          .single();
        deletedSkillName = customSkillData?.skill_name || 'Unknown Custom Skill';
      } else {
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
          deletedSkillName = skills[0].name;
        }
      }

      const currentSubtypesForGrant: string[] = Array.isArray(fighter.fighter_subtypes)
        ? fighter.fighter_subtypes
        : [];
      const editionSlugForUndo = editionSlugOf(fighter);

      // Load catalog subtypes once for N26 promotion undo checks.
      let catalogSubtypesForUndo: string[] = [];
      if (fighter.fighter_type_id) {
        const { data: catalogType } = await supabase
          .from('fighter_types')
          .select('fighter_subtypes')
          .eq('id', fighter.fighter_type_id)
          .maybeSingle();
        catalogSubtypesForUndo = Array.isArray(catalogType?.fighter_subtypes)
          ? catalogType!.fighter_subtypes
          : [];
      }

      // N26 Prospect keep-type grant: edition + catalog Prospect + post-promo subtypes.
      // Do not use skill/specialisation match alone — native specialised Gangers share those.
      let isProspectPromotionGrant = isN26ProspectPromotionUndoCandidate({
        editionSlug: editionSlugForUndo,
        currentSubtypes: currentSubtypesForGrant,
        catalogSubtypes: catalogSubtypesForUndo,
        fighterSpecialisationId: fighter.fighter_specialisation_id,
        skillId: skillData.skill_id,
        skillName: deletedSkillName,
        editionAllowsProspectPromotion: hasProspectSpecialisationPromotion(editionSlugForUndo),
      });
      if (isProspectPromotionGrant && !fighter.fighter_type_id) {
        isProspectPromotionGrant = false;
      }

      // Must undo Champion/Leader first — demoting Prospect while promoted would conflict.
      // Does not rely on catalog Prospect alone: Champion→Leader rewrites fighter_type_id.
      if (
        isN26ProspectPromotionSkillBlockedByHigherRank({
          editionAllowsProspectPromotion: hasProspectSpecialisationPromotion(editionSlugForUndo),
          fighterSpecialisationId: fighter.fighter_specialisation_id,
          skillId: skillData.skill_id,
          skillName: deletedSkillName,
          currentSubtypes: currentSubtypesForGrant,
          catalogSubtypes: catalogSubtypesForUndo,
        })
      ) {
        return {
          success: false,
          error: currentSubtypesForGrant.includes('Leader')
            ? 'Undo the Leader promotion before undoing the Prospect promotion'
            : 'Undo the Champion promotion (Inspiring) before undoing the Prospect promotion',
        };
      }

      // N26 Ganger→Champion keep-type grant: only demote when catalog type is a
      // Ganger row currently wearing Champion (not a starting Champion type).
      let isGangerChampionPromotionGrant = isN26GangerChampionPromotionSkillGrant(
        currentSubtypesForGrant,
        skillData.skill_id,
        deletedSkillName
      );
      if (isGangerChampionPromotionGrant && fighter.fighter_type_id) {
        isGangerChampionPromotionGrant =
          catalogSubtypesForUndo.includes('Ganger') &&
          !catalogSubtypesForUndo.includes('Champion');
      } else if (isGangerChampionPromotionGrant && !fighter.fighter_type_id) {
        // Custom fighters have no catalog Ganger row to verify — do not demote.
        isGangerChampionPromotionGrant = false;
      }

      // N26 Champion→Leader grant: demote subtypes when catalog type is a Leader row.
      let isLeaderPromotionGrant = isN26LeaderPromotionSkillGrant(
        currentSubtypesForGrant,
        skillData.skill_id,
        deletedSkillName
      );
      if (isLeaderPromotionGrant && fighter.fighter_type_id) {
        isLeaderPromotionGrant = catalogSubtypesForUndo.includes('Leader');
      } else if (isLeaderPromotionGrant && !fighter.fighter_type_id) {
        isLeaderPromotionGrant = false;
      }

      if (isProspectPromotionGrant || isGangerChampionPromotionGrant || isLeaderPromotionGrant) {
        refundStash = false;
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

      // Check if this skill has linked effect types (for cache invalidation)
      // The actual effect rows will be cascade-deleted via fighter_skill_id FK
      const skillEffectTypes = skillData.skill_id ? (await supabase
        .from('fighter_effect_types')
        .select('id')
        .eq('type_specific_data->>skill_id', skillData.skill_id)).data : null;

      const hasLinkedEffects = skillEffectTypes && skillEffectTypes.length > 0;

      // Delete the skill (cascade deletes linked fighter_effects via fighter_skill_id FK)
      const { error: deleteError } = await supabase
        .from('fighter_skills')
        .delete()
        .eq('id', params.advancement_id);

      if (deleteError) {
        return { success: false, error: 'Failed to delete skill' };
      }

      // Invalidate effect cache if cascade-deleted linked effects
      if (hasLinkedEffects) {
        invalidateFighterAdvancement({
          fighterId: params.fighter_id,
          gangId: fighter.gang_id,
          advancementType: 'effect'
        });
      }

      // Undo N26 promotion grants (subtypes; Leader undo does not restore previous type)
      if (isProspectPromotionGrant || isGangerChampionPromotionGrant || isLeaderPromotionGrant) {
        const currentSubtypes: string[] = Array.isArray(fighter.fighter_subtypes)
          ? fighter.fighter_subtypes
          : [];
        const specialRules = Array.isArray(fighter.special_rules) ? fighter.special_rules : [];
        const demotedSubtypes = isProspectPromotionGrant
          ? buildN26ProspectDemotionSubtypes(currentSubtypes)
          : isLeaderPromotionGrant
            ? buildN26ChampionLeaderDemotionSubtypes(currentSubtypes)
            : buildN26GangerChampionDemotionSubtypes(currentSubtypes);
        const demoteResult = await updateFighterDetails({
          fighter_id: params.fighter_id,
          fighter_subtypes: demotedSubtypes,
          fighter_type: fighter.fighter_type ?? undefined,
          fighter_type_id: fighter.fighter_type_id ?? undefined,
          fighter_specialisation: isProspectPromotionGrant
            ? null
            : (fighter.fighter_specialisation ?? null),
          fighter_specialisation_id: isProspectPromotionGrant
            ? null
            : (fighter.fighter_specialisation_id ?? null),
          special_rules: specialRules,
        });
        if (!demoteResult.success) {
          return {
            success: false,
            error: demoteResult.error
              || (isProspectPromotionGrant
                ? 'Skill removed but Prospect demotion failed — please restore Prospect subtypes in Edit Fighter.'
                : isLeaderPromotionGrant
                  ? 'Skill removed but Leader demotion failed — please restore Champion subtype in Edit Fighter.'
                  : 'Skill removed but Ganger demotion failed — please restore Ganger subtype in Edit Fighter.'),
          };
        }
        demotedFighterDetails = {
          fighter_subtypes: demotedSubtypes,
          fighter_specialisation: isProspectPromotionGrant
            ? null
            : (fighter.fighter_specialisation ?? null),
          fighter_specialisation_id: isProspectPromotionGrant
            ? null
            : (fighter.fighter_specialisation_id ?? null),
          special_rules: specialRules,
        };
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
        xp: spendsXp ? fighter.xp + xpToRefund : fighter.xp,
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
      if (refundStash) {
        // Non-advancement skill: refund credits to gang stash AND decrease rating
        await updateGangFinancials(supabase, {
          gangId: fighter.gang_id,
          ratingDelta: countsTowardRating(fighter) ? ratingDelta : 0,
          creditsDelta: -ratingDelta // ratingDelta is negative, so -ratingDelta is positive (refund)
        });
        invalidateGangCredits(fighter.gang_id);
      } else {
        // Advancement skill or effect: only decrease rating (XP was the currency)
        if (countsTowardRating(fighter)) {
          await updateGangRatingSimple(supabase, fighter.gang_id, ratingDelta);
        }
      }

      // Home page gangs list cache (server-side, user-scoped)
      invalidateUserGangsList(fighter.user_id);
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
      include_gang_rating: true,
      spends_xp: spendsXp,
      ...(refundStash && Math.abs(ratingDelta) > 0 ? { credits_refunded: Math.abs(ratingDelta) } : {})
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
      remaining_xp: updatedFighter.xp,
      refund_stash: refundStash,
      ...(demotedFighterDetails ? { fighter_details: demotedFighterDetails } : {}),
    };

  } catch (error) {
    console.error('Error deleting advancement:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
}

// Power Boost operations for Spyrers
export interface AddPowerBoostParams {
  fighter_id: string;
  power_boost_type_id: string;
  kill_cost: number;
  /** Child effect type IDs selected by user (used when power boost has separate child effect types) */
  selected_effect_ids?: string[];
  /** Modifier IDs selected by user (used when parent power boost has effect_selection and multiple modifiers) */
  selected_modifier_ids?: string[];
}

export async function addPowerBoost(
  params: AddPowerBoostParams
): Promise<AdvancementResult> {
  try {
    const supabase = await createClient();

    const user = await getAuthenticatedUser(supabase);

    // Verify fighter ownership and get fighter data
    const { data: fighter, error: fighterError} = await supabase
      .from('fighters')
      .select('id, user_id, gang_id, kill_count, fighter_name, killed, retired, enslaved, captured')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      return { success: false, error: 'Fighter not found' };
    }

    // Check if fighter has enough kills
    const currentKillCount = fighter.kill_count || 0;
    if (currentKillCount < params.kill_cost) {
      return { success: false, error: 'Insufficient kills' };
    }

    // Get the power boost type details
    const { data: effectType, error: effectTypeError } = await supabase
      .from('fighter_effect_types')
      .select('id, effect_name, type_specific_data, sort_order')
      .eq('id', params.power_boost_type_id)
      .single();

    if (effectTypeError || !effectType) {
      return { success: false, error: 'Power boost type not found' };
    }

    // Merge type_specific_data with kill cost
    const mergedTypeData = {
      ...(effectType.type_specific_data || {}),
      kill_cost: params.kill_cost
    };

    // Insert the new power boost as a fighter effect with fighter owner's user_id
    const { data: insertedEffect, error: insertError } = await supabase
      .from('fighter_effects')
      .insert({
        fighter_id: params.fighter_id,
        fighter_effect_type_id: params.power_boost_type_id,
        effect_name: effectType.effect_name,
        type_specific_data: mergedTypeData,
        sort_order: effectType.sort_order ?? null,
        user_id: fighter.user_id
      })
      .select('id')
      .single();

    if (insertError || !insertedEffect) {
      return { success: false, error: 'Failed to insert power boost' };
    }

    // Get modifiers for this power boost type and insert them
    const { data: modifierTemplates, error: modifierError } = await supabase
      .from('fighter_effect_type_modifiers')
      .select('id, stat_name, default_numeric_value, operation')
      .eq('fighter_effect_type_id', params.power_boost_type_id);

    if (modifierTemplates && modifierTemplates.length > 0) {
      // Filter by selected_modifier_ids if provided
      const modifiersToCreate = params.selected_modifier_ids && params.selected_modifier_ids.length > 0
        ? modifierTemplates.filter(m => params.selected_modifier_ids!.includes(m.id))
        : modifierTemplates;

      if (modifiersToCreate.length > 0) {
        const modifiersToInsert = modifiersToCreate.map(template => ({
          fighter_effect_id: insertedEffect.id,
          stat_name: template.stat_name,
          numeric_value: template.default_numeric_value,
          operation: template.operation || 'add'
        }));

        const { error: modifierInsertError } = await supabase
          .from('fighter_effect_modifiers')
          .insert(modifiersToInsert);

        if (modifierInsertError) {
          return { success: false, error: 'Failed to insert power boost modifiers' };
        }
      }
    }

    // If there are selected effect types (child effects), create them as well
    if (params.selected_effect_ids && params.selected_effect_ids.length > 0) {
      const failedEffects: string[] = [];

      for (const effectTypeId of params.selected_effect_ids) {
        // Get the effect type details
        const { data: childEffectType, error: childEffectTypeError } = await supabase
          .from('fighter_effect_types')
          .select('id, effect_name, type_specific_data, sort_order')
          .eq('id', effectTypeId)
          .single();

        if (childEffectTypeError || !childEffectType) {
          failedEffects.push(effectTypeId);
          continue;
        }

        // Insert the child effect with fighter owner's user_id
        const { data: childEffect, error: childEffectError } = await supabase
          .from('fighter_effects')
          .insert({
            fighter_id: params.fighter_id,
            fighter_effect_type_id: effectTypeId,
            effect_name: childEffectType.effect_name,
            type_specific_data: childEffectType.type_specific_data,
            sort_order: childEffectType.sort_order ?? null,
            user_id: fighter.user_id
          })
          .select('id')
          .single();

        if (childEffectError || !childEffect) {
          failedEffects.push(effectTypeId);
          continue;
        }

        // Get modifiers for this child effect type
        const { data: childModifiers, error: childModifiersError } = await supabase
          .from('fighter_effect_type_modifiers')
          .select('stat_name, default_numeric_value, operation')
          .eq('fighter_effect_type_id', effectTypeId);

        if (childModifiersError) {
          failedEffects.push(effectTypeId);
          continue;
        }

        if (childModifiers && childModifiers.length > 0) {
          const childModifiersToInsert = childModifiers.map(template => ({
            fighter_effect_id: childEffect.id,
            stat_name: template.stat_name,
            numeric_value: template.default_numeric_value,
            operation: template.operation || 'add'
          }));

          const { error: insertModifiersError } = await supabase
            .from('fighter_effect_modifiers')
            .insert(childModifiersToInsert);

          if (insertModifiersError) {
            failedEffects.push(effectTypeId);
            continue;
          }
        }
      }

      // If any effects failed, fail the entire operation
      if (failedEffects.length > 0) {
        return {
          success: false,
          error: `Failed to add ${failedEffects.length} of ${params.selected_effect_ids.length} selected effect(s)`
        };
      }
    }

    // Extract credits_increase from type_specific_data for gang rating
    let creditsIncrease = 0;
    if (effectType.type_specific_data && typeof effectType.type_specific_data === 'object') {
      const typeData = effectType.type_specific_data as PowerBoostTypeData;
      creditsIncrease = typeData.credits_increase || 0;
    }

    // Update fighter's kill_count (credits are calculated from effects, not stored)
    const newKillCount = currentKillCount - params.kill_cost;

    const { data: updatedFighter, error: updateError } = await supabase
      .from('fighters')
      .update({
        kill_count: newKillCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.fighter_id)
      .select('id, kill_count, credits')
      .single();

    if (updateError || !updatedFighter) {
      return { success: false, error: 'Failed to update fighter' };
    }

    // Update gang rating and wealth (+credits_increase) — only for active fighters
    if (creditsIncrease > 0 && countsTowardRating(fighter)) {
      const result = await updateGangRatingSimple(supabase, fighter.gang_id, creditsIncrease);
      if (!result.success) {
        return { success: false, error: 'Failed to update gang rating/wealth: ' + result.error };
      }

      // Home page gangs list cache (server-side, user-scoped)
      invalidateUserGangsList(fighter.user_id);
    }

    // Invalidate fighter cache
    invalidateFighterData(params.fighter_id, fighter.gang_id);

    // If this is a beast fighter, also invalidate owner's cache
    await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase);

    // Invalidate cache for fighter advancement (effects for power boosts)
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
      fighter: {
        id: updatedFighter.id,
        xp: 0 // Not used for power boosts
      },
      effect: createdEffect || null
    };

  } catch (error) {
    console.error('Error adding power boost:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export interface DeletePowerBoostParams {
  fighter_id: string;
  power_boost_id: string;
}

export async function deletePowerBoost(
  params: DeletePowerBoostParams
): Promise<AdvancementResult> {
  try {
    const supabase = await createClient();

    const user = await getAuthenticatedUser(supabase);

    // Verify fighter ownership
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, user_id, gang_id, kill_count, fighter_name, killed, retired, enslaved, captured')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      return { success: false, error: 'Fighter not found' };
    }

    // Check if effect exists and get effect data
    const { data: effectData, error: effectError } = await supabase
      .from('fighter_effects')
      .select('id, fighter_id, type_specific_data, effect_name')
      .eq('id', params.power_boost_id)
      .single();

    if (effectError || !effectData) {
      return { success: false, error: 'Power boost not found' };
    }

    if (effectData.fighter_id !== params.fighter_id) {
      return { success: false, error: 'Power boost does not belong to this fighter' };
    }

    // Extract kill cost and credits from type_specific_data
    let killCostToRefund = 0;
    let creditsToDeduct = 0;
    if (effectData.type_specific_data && typeof effectData.type_specific_data === 'object') {
      const typeData = effectData.type_specific_data as PowerBoostTypeData;
      killCostToRefund = typeData.kill_cost || 0;
      creditsToDeduct = typeData.credits_increase || 0;
    }

    // Delete the effect (this will cascade delete the modifiers)
    const { error: deleteError } = await supabase
      .from('fighter_effects')
      .delete()
      .eq('id', params.power_boost_id);

    if (deleteError) {
      return { success: false, error: 'Failed to delete power boost' };
    }

    // Update fighter's kill_count (refund kills) - credits are calculated from effects
    const newKillCount = (fighter.kill_count || 0) + killCostToRefund;

    const { data: updatedFighter, error: updateError } = await supabase
      .from('fighters')
      .update({
        kill_count: newKillCount,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.fighter_id)
      .select('id, kill_count, credits')
      .single();

    if (updateError || !updatedFighter) {
      return { success: false, error: 'Failed to update fighter' };
    }

    // Update gang rating and wealth (-credits_increase) — only for active fighters
    if (creditsToDeduct > 0 && countsTowardRating(fighter)) {
      const result = await updateGangRatingSimple(supabase, fighter.gang_id, -creditsToDeduct);
      if (!result.success) {
        return { success: false, error: 'Failed to update gang rating/wealth: ' + result.error };
      }

      // Home page gangs list cache (server-side, user-scoped)
      invalidateUserGangsList(fighter.user_id);
    }

    // Invalidate fighter cache
    invalidateFighterData(params.fighter_id, fighter.gang_id);

    // If this is a beast fighter, also invalidate owner's cache
    await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase);

    // Invalidate cache for fighter advancement
    invalidateFighterAdvancement({
      fighterId: params.fighter_id,
      gangId: fighter.gang_id,
      advancementType: 'effect'
    });

    return {
      success: true,
      fighter: {
        id: updatedFighter.id,
        xp: 0 // Not used for power boosts
      }
    };

  } catch (error) {
    console.error('Error deleting power boost:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// ---------------------------------------------------------------------------
// Advancement roll logging (gang log) — N23 Ganger / Exotic Beast, N26 any model
// ---------------------------------------------------------------------------

export interface VerifyAndLogRolledGangerAdvancementRollParams {
  fighter_id: string;
  advancement_table: string;
  outcome_label: string;
  dice_data: Record<string, unknown>;
}

const GANGER_ELIGIBLE_SUBTYPES = new Set(['Ganger', 'Exotic Beast']);

/**
 * Whether the edition splits advancement rolls by fighter subtype.
 *
 * N23 does: Gangers and Exotic Beasts roll on their own flat-cost table and log
 * through the roll logger below, while every other subtype rolls for a skill and
 * logs through the skill logger. The two guards are the halves of that routing.
 *
 * N26 has no such split — every model rolls on the one Advancement table — so
 * neither guard applies. Left in place it rejects both directions: an N26 model
 * that is not a Ganger cannot log an Advancement roll, and an N26 Ganger cannot
 * log a skill roll. 'Exotic Beast' is an N23-only subtype, so the list can never
 * rescue an N26 fighter.
 */
const routesRollsBySubtype = (fighter: any): boolean =>
  !hasCumulativeXp(editionSlugOf(fighter));

const isGangerEligible = (fighter: any): boolean =>
  !!fighter.fighter_subtypes?.some((subtype: string) => GANGER_ELIGIBLE_SUBTYPES.has(subtype));

export async function verifyAndLogRolledGangerAdvancementRoll(
  params: VerifyAndLogRolledGangerAdvancementRollParams
): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select(ROLL_LOGGER_FIGHTER_SELECT)
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      throw new Error('Fighter not found');
    }

    if (routesRollsBySubtype(fighter) && !isGangerEligible(fighter)) {
      throw new Error('Advancement roll is only for Gangers and Exotic Beasts');
    }

    return await logRolledGangerAdvancement({
      gang_id: fighter.gang_id,
      fighter_id: params.fighter_id,
      fighter_name: fighter.fighter_name,
      advancement_table: params.advancement_table,
      outcome_label: params.outcome_label,
      dice_data: params.dice_data
    });
  } catch (error) {
    console.error('Failed to log the Ganger / Exotic Beast advancement roll:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

// ---------------------------------------------------------------------------
// Skill advancement — random roll logging (gang log)
// ---------------------------------------------------------------------------

export interface VerifyAndLogRolledSkillAdvancementRollParams {
  fighter_id: string;
  /** The skill set name the roll was made within. */
  skill_set_name: string;
  /**
   * Effective skill set access level the fighter had when the roll was made,
   * e.g. "Primary", "Secondary", "Allowed", or "Not normally accessible".
   */
  skill_set_access_label: string;
  /** The acquisition type label, e.g. "Random Primary", "Random Secondary", "Random Any". */
  acquisition_type_label: string;
  /** The skill the dice landed on. */
  outcome_label: string;
  dice_data: Record<string, unknown>;
}

/**
 * Logs a random skill advancement roll to the gang log. Where the edition routes
 * rolls by subtype, rejects Ganger / Exotic Beast fighters because they have
 * their own dedicated logging pathway via
 * `verifyAndLogRolledGangerAdvancementRoll`.
 */
export async function verifyAndLogRolledSkillAdvancementRoll(
  params: VerifyAndLogRolledSkillAdvancementRollParams
): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select(ROLL_LOGGER_FIGHTER_SELECT)
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      throw new Error('Fighter not found');
    }

    if (routesRollsBySubtype(fighter) && isGangerEligible(fighter)) {
      throw new Error('Use the Ganger / Exotic Beast advancement roll logger for this fighter subtype');
    }

    return await logRolledSkillAdvancement({
      gang_id: fighter.gang_id,
      fighter_id: params.fighter_id,
      fighter_name: fighter.fighter_name,
      skill_set_name: params.skill_set_name,
      skill_set_access_label: params.skill_set_access_label,
      acquisition_type_label: params.acquisition_type_label,
      outcome_label: params.outcome_label,
      dice_data: params.dice_data
    });
  } catch (error) {
    console.error('Failed to log the skill advancement roll:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
