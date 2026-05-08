'use server';

import { createClient } from '@/utils/supabase/server';
import { invalidateFighterData } from '@/utils/cache-tags';
import { updateGangRatingSimple } from '@/utils/gang-rating-and-wealth';
import { logFighterInjury, logFighterRecovery, logRolledFighterInjury } from './logs/gang-fighter-logs';
import { logFighterAction } from './logs/fighter-logs';
import { getAuthenticatedUser, checkAdmin } from '@/utils/auth';
import { CACHE_TAGS } from '@/utils/cache-tags';
import { revalidateTag } from 'next/cache';
import type { GangLogActionResult } from './logs/gang-logs';
import { countsTowardRating, hasKilledStatusFlag } from '@/utils/fighter-status';
import { getFighterTotalCost } from '@/app/lib/shared/fighter-data';

export interface AddFighterInjuryParams {
  fighter_id: string;
  injury_type_id: string;
  send_to_recovery?: boolean;
  set_killed?: boolean;
  set_captured?: boolean;
  captured_by_gang_id?: string | null;
  target_equipment_id?: string;
}

export interface VerifyAndLogRolledFighterInjuryParams {
  fighter_id: string;
  injury_type_id: string;
  injury_table: string;
  dice_data: any;
}

export interface DeleteFighterInjuryParams {
  fighter_id: string;
  injury_id: string;
}

export interface InjuryResult {
  success: boolean;
  error?: string;
  injury?: {
    id: string;
    effect_name: string;
    fighter_effect_type_id: string;
    fighter_effect_modifiers: any[];
    type_specific_data: any;
    created_at: string;
  };
  recovery_status?: boolean;
  captured_status?: boolean;
  killed_status?: boolean;
  gang?: {
    id: string;
    credits: number;
    rating: number;
    wealth: number;
  };
}

export async function verifyAndLogRolledFighterInjury(params: VerifyAndLogRolledFighterInjuryParams
): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();

    // Ensure we are dealing with an authenticated user
    await getAuthenticatedUser(supabase);

    // Verify fighter ownership
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, user_id, gang_id, fighter_name')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      throw new Error('Fighter not found');
    }

    // Verify that the passed in injury (fighter effect type) exists
    const { data: fighterEffectType, error: fighterEffectTypeError } = await supabase
      .from('fighter_effect_types')
      .select('id, effect_name')
      .eq('id', params.injury_type_id)
      .single();

    if (fighterEffectTypeError || !fighterEffectType) {
      throw new Error('Injury not found!');
    }

    const payload = {
      gang_id: fighter.gang_id,
      fighter_id: params.fighter_id,
      fighter_name: fighter.fighter_name,
      injury_name: fighterEffectType.effect_name,
      injury_table: params.injury_table,
      dice_data: params.dice_data
    };

    return await logRolledFighterInjury(payload);
  } catch (error) {
    console.error('Failed to log the injury roll:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

export async function addFighterInjury(
  params: AddFighterInjuryParams
): Promise<InjuryResult> {
  try {
    const supabase = await createClient();
    
    // Check authentication with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Check if user is an admin
    const isAdmin = await checkAdmin(supabase, user);

    // Verify fighter ownership
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, user_id, gang_id, fighter_name, killed, retired, enslaved, captured, recovery')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      return { success: false, error: 'Fighter not found' };
    }

    // Note: Authorization is enforced by RLS policies on fighters table

    if (params.set_captured) {
      const { data: existingCapturedInjuries, error: existingCapturedInjuriesError } = await supabase
        .from('fighter_effects')
        .select('id')
        .eq('fighter_id', params.fighter_id)
        .eq('effect_name', 'Captured')
        .limit(1);

      if (existingCapturedInjuriesError) {
        return {
          success: false,
          error: existingCapturedInjuriesError.message || 'Failed to check existing Captured injury'
        };
      }

      if (existingCapturedInjuries && existingCapturedInjuries.length > 0) {
        return {
          success: false,
          error: 'Fighter already has the Captured lasting injury'
        };
      }
    }

    let shouldSetKilled = !!params.set_killed;
    if (!shouldSetKilled) {
      const { data: injuryType, error: injuryTypeError } = await supabase
        .from('fighter_effect_types')
        .select('type_specific_data')
        .eq('id', params.injury_type_id)
        .single();

      if (injuryTypeError || !injuryType) {
        return {
          success: false,
          error: injuryTypeError?.message || 'Injury type not found'
        };
      }

      shouldSetKilled = hasKilledStatusFlag(injuryType.type_specific_data || {});
    }

    let preInjuryCost = 0;
    if (shouldSetKilled && !fighter.killed && countsTowardRating(fighter)) {
      try {
        preInjuryCost = await getFighterTotalCost(params.fighter_id, supabase);
      } catch (e) {
        console.error('Failed to compute pre-injury fighter total cost for killed injury rating adjustment:', e);
      }
    }

    // Add the injury using the RPC function
    const { data, error } = await supabase
      .rpc('add_fighter_injury', {
        in_fighter_id: params.fighter_id,
        in_injury_type_id: params.injury_type_id,
        in_user_id: user.id,
        in_target_equipment_id: params.target_equipment_id || null
      });

    if (error) {
      console.error('Database error:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to add injury'
      };
    }

    // The database function returns the complete injury data with modifiers
    const injuryData = data[0]?.result || data;
    const delta = (injuryData?.type_specific_data?.credits_increase || 0) as number;
    if (delta && !shouldSetKilled) {
      await updateGangRatingSimple(supabase, fighter.gang_id, delta);
    }
    
    // Handle status updates from parameters
    const statusUpdates: Record<string, boolean | string | null> = {};
    if (params.send_to_recovery) statusUpdates.recovery = true;
    if (shouldSetKilled) {
      statusUpdates.killed = true;
      statusUpdates.recovery = false;
    }
    if (params.set_captured) {
      statusUpdates.captured = true;
      statusUpdates.captured_by_gang_id = params.captured_by_gang_id ?? null;
      statusUpdates.recovery = false;
    }

    let recoveryStatus = undefined;
    let capturedStatus = undefined;
    let killedStatus = undefined;
    let killedFinancialResult = null;
    let killedRatingDelta = 0;

    if (shouldSetKilled && !fighter.killed) {
      if (countsTowardRating(fighter)) {
        // Use pre-write cost to avoid stale unstable_cache reads within this request.
        killedRatingDelta = -preInjuryCost;
      }
    }

    if (Object.keys(statusUpdates).length > 0) {
      const { error: statusError } = await supabase
        .from('fighters')
        .update(statusUpdates)
        .eq('id', params.fighter_id);

      if (statusError) {
        console.error('Error setting fighter status:', statusError);

        if (injuryData?.id) {
          const { error: rollbackInjuryError } = await supabase
            .from('fighter_effects')
            .delete()
            .eq('id', injuryData.id);

          if (rollbackInjuryError) {
            console.error('Error rolling back injury after status failure:', rollbackInjuryError);
          }
        }

        // Roll back only the standalone credits_increase adjustment applied before status updates.
        // killedRatingDelta is applied later, so there is nothing to undo for kill-path rating here.
        if (delta && !shouldSetKilled) {
          await updateGangRatingSimple(supabase, fighter.gang_id, -delta);
        }

        invalidateFighterData(params.fighter_id, fighter.gang_id);
        revalidateTag(CACHE_TAGS.BASE_FIGHTER_EFFECTS(params.fighter_id));

        return {
          success: false,
          error: statusError.message || 'Failed to update fighter status'
        };
      } else {
        recoveryStatus = typeof statusUpdates.recovery === 'boolean' ? statusUpdates.recovery : undefined;
        capturedStatus = typeof statusUpdates.captured === 'boolean' ? statusUpdates.captured : undefined;
        killedStatus = typeof statusUpdates.killed === 'boolean' ? statusUpdates.killed : undefined;
      }
    }

    if (killedRatingDelta !== 0) {
      killedFinancialResult = await updateGangRatingSimple(supabase, fighter.gang_id, killedRatingDelta);
    }

    if (fighter.fighter_name) {
      await logFighterInjury({
        gang_id: fighter.gang_id,
        fighter_id: params.fighter_id,
        fighter_name: fighter.fighter_name,
        injury_name: injuryData.effect_name
      });

      if (killedStatus === true && !fighter.killed) {
        await logFighterAction({
          gang_id: fighter.gang_id,
          fighter_id: params.fighter_id,
          fighter_name: fighter.fighter_name,
          action_type: 'fighter_killed',
          oldCredits: killedFinancialResult?.oldValues?.credits,
          oldRating: killedFinancialResult?.oldValues?.rating,
          oldWealth: killedFinancialResult?.oldValues?.wealth,
          newCredits: killedFinancialResult?.newValues?.credits,
          newRating: killedFinancialResult?.newValues?.rating,
          newWealth: killedFinancialResult?.newValues?.wealth
        });
      }
    }

    // Invalidate fighter cache
    invalidateFighterData(params.fighter_id, fighter.gang_id);
    revalidateTag(CACHE_TAGS.BASE_FIGHTER_EFFECTS(params.fighter_id));

    // If injury grants a skill, invalidate skills cache
    if (injuryData?.type_specific_data?.skill_id) {
      revalidateTag(CACHE_TAGS.BASE_FIGHTER_SKILLS(params.fighter_id));
    }

    return {
      success: true,
      injury: {
        id: injuryData.id,
        effect_name: injuryData.effect_name,
        fighter_effect_type_id: injuryData.effect_type?.id,
        fighter_effect_modifiers: injuryData.modifiers || [],
        type_specific_data: injuryData.type_specific_data,
        created_at: injuryData.created_at || new Date().toISOString()
      },
      recovery_status: recoveryStatus,
      captured_status: capturedStatus,
      killed_status: killedStatus,
      gang: killedFinancialResult?.newValues
        ? {
            id: fighter.gang_id,
            credits: killedFinancialResult.newValues.credits,
            rating: killedFinancialResult.newValues.rating,
            wealth: killedFinancialResult.newValues.wealth
          }
        : undefined
    };

  } catch (error) {
    console.error('Error adding fighter injury:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
}

export async function deleteFighterInjury(
  params: DeleteFighterInjuryParams
): Promise<InjuryResult> {
  try {
    const supabase = await createClient();
    
    // Check authentication with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Check if user is an admin
    const isAdmin = await checkAdmin(supabase, user);

    // Verify fighter ownership
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, user_id, gang_id, fighter_name, killed, retired, enslaved, captured, recovery')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      return { success: false, error: 'Fighter not found' };
    }

    // Note: Authorization is enforced by RLS policies on fighters table

    const { data: injury, error: injuryError } = await supabase
      .from('fighter_effects')
      .select('id, fighter_id, effect_name, type_specific_data')
      .eq('id', params.injury_id)
      .single();

    if (injuryError || !injury || injury.fighter_id !== params.fighter_id) {
      return { success: false, error: 'Injury not found or does not belong to this fighter' };
    }

    const removedKilledStatusEffect = hasKilledStatusFlag(injury.type_specific_data);
    const willBeActiveAfterResurrection = countsTowardRating({ ...fighter, killed: false });
    let preDeletionCost = 0;

    if (removedKilledStatusEffect && fighter.killed && willBeActiveAfterResurrection) {
      try {
        preDeletionCost = await getFighterTotalCost(params.fighter_id, supabase);
      } catch (e) {
        console.error('Failed to compute pre-deletion fighter total cost for killed injury removal rating adjustment:', e);
      }
    }

    // Delete any skills granted by this injury before deleting the injury
    const { data: relatedSkills } = await supabase
      .from('fighter_effect_skills')
      .select('fighter_skill_id')
      .eq('fighter_effect_id', params.injury_id);

    let hasRelatedSkills = false;
    if (relatedSkills && relatedSkills.length > 0) {
      hasRelatedSkills = true;
      const skillIds = relatedSkills.map(rs => rs.fighter_skill_id);
      await supabase
        .from('fighter_skills')
        .delete()
        .in('id', skillIds);
    }

    // Delete the injury (this will cascade delete the modifiers)
    const { error: deleteError } = await supabase
      .from('fighter_effects')
      .delete()
      .eq('id', params.injury_id);

    if (deleteError) {
      console.error('Database error:', deleteError);
      return { 
        success: false, 
        error: deleteError.message || 'Failed to delete injury'
      };
    }

    // Decrease rating by injury credits_increase if present.
    // Fatal injuries skip applying credits_increase when added, so do not reverse it on removal.
    const creditsIncrease = (injury?.type_specific_data?.credits_increase || 0) as number;
    const delta = -creditsIncrease;
    if (delta && !removedKilledStatusEffect) {
      await updateGangRatingSimple(supabase, fighter.gang_id, delta);
    }

    let killedStatus = undefined;
    let resurrectedFinancialResult = null;

    if (removedKilledStatusEffect) {
      const { data: remainingEffects, error: remainingEffectsError } = await supabase
        .from('fighter_effects')
        .select('id, type_specific_data')
        .eq('fighter_id', params.fighter_id);

      if (remainingEffectsError) {
        console.error('Error checking remaining killed-status effects:', remainingEffectsError);
        return {
          success: false,
          error: remainingEffectsError.message || 'Failed to check remaining killed-status effects'
        };
      }

      const hasRemainingKilledStatusEffect = (remainingEffects || []).some(effect =>
        hasKilledStatusFlag(effect.type_specific_data)
      );

      if (!hasRemainingKilledStatusEffect && fighter.killed) {
        const wasActive = countsTowardRating(fighter);
        const willBeActive = willBeActiveAfterResurrection;
        let resurrectedRatingDelta = 0;

        if (!wasActive && willBeActive) {
          resurrectedRatingDelta = preDeletionCost - creditsIncrease;
        }

        const { error: killedStatusError } = await supabase
          .from('fighters')
          .update({
            killed: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', params.fighter_id);

        if (killedStatusError) {
          console.error('Error clearing fighter killed status:', killedStatusError);
          return {
            success: false,
            error: killedStatusError.message || 'Failed to clear fighter killed status'
          };
        }

        killedStatus = false;

        if (resurrectedRatingDelta !== 0) {
          resurrectedFinancialResult = await updateGangRatingSimple(supabase, fighter.gang_id, resurrectedRatingDelta);
        }
      }
    }

    // Log the injury removal as recovery
    if (fighter.fighter_name) {
      await logFighterRecovery({
        gang_id: fighter.gang_id,
        fighter_id: params.fighter_id,
        fighter_name: fighter.fighter_name,
        recovery_type: 'injury_removed',
        recovered_from: injury.effect_name
      });

      if (killedStatus === false) {
        await logFighterAction({
          gang_id: fighter.gang_id,
          fighter_id: params.fighter_id,
          fighter_name: fighter.fighter_name,
          action_type: 'fighter_resurrected',
          oldCredits: resurrectedFinancialResult?.oldValues?.credits,
          oldRating: resurrectedFinancialResult?.oldValues?.rating,
          oldWealth: resurrectedFinancialResult?.oldValues?.wealth,
          newCredits: resurrectedFinancialResult?.newValues?.credits,
          newRating: resurrectedFinancialResult?.newValues?.rating,
          newWealth: resurrectedFinancialResult?.newValues?.wealth
        });
      }
    }

    // Invalidate fighter cache
    invalidateFighterData(params.fighter_id, fighter.gang_id);
    revalidateTag(CACHE_TAGS.BASE_FIGHTER_EFFECTS(params.fighter_id));

    // If injury had related skills, invalidate skills cache
    if (hasRelatedSkills) {
      revalidateTag(CACHE_TAGS.BASE_FIGHTER_SKILLS(params.fighter_id));
    }

    return {
      success: true,
      killed_status: killedStatus,
      gang: resurrectedFinancialResult?.newValues
        ? {
            id: fighter.gang_id,
            credits: resurrectedFinancialResult.newValues.credits,
            rating: resurrectedFinancialResult.newValues.rating,
            wealth: resurrectedFinancialResult.newValues.wealth
          }
        : undefined
    };

  } catch (error) {
    console.error('Error deleting fighter injury:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
} 