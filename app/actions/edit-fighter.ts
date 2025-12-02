'use server'

import { createClient } from "@/utils/supabase/server";
import { invalidateFighterData, invalidateFighterAdvancement, invalidateGangCredits, CACHE_TAGS, invalidateGangRating } from '@/utils/cache-tags';
import { revalidateTag } from 'next/cache';
import { logFighterRecovery } from './logs/gang-fighter-logs';
import { getAuthenticatedUser } from '@/utils/auth';
import { getFighterTotalCost } from '@/app/lib/shared/fighter-data';
import { logFighterAction, calculateFighterCredits } from './logs/fighter-logs';

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
    revalidateTag(CACHE_TAGS.COMPUTED_FIGHTER_BEAST_COSTS(ownerData.fighter_owner_id));
  }
}

interface EditFighterStatusParams {
  fighter_id: string;
  action: 'kill' | 'retire' | 'sell' | 'rescue' | 'starve' | 'recover' | 'capture' | 'delete';
  sell_value?: number;
}

export interface UpdateFighterXpParams {
  fighter_id: string;
  xp_to_add: number;
}

export interface UpdateFighterDetailsParams {
  fighter_id: string;
  fighter_name?: string;
  label?: string;
  kills?: number;
  kill_count?: number;
  cost_adjustment?: number;
  special_rules?: string[];
  fighter_class?: string;
  fighter_class_id?: string;
  fighter_type?: string;
  fighter_type_id?: string;
  fighter_sub_type?: string | null;
  fighter_sub_type_id?: string | null;
  note?: string;
  note_backstory?: string;
  fighter_gang_legacy_id?: string | null;
  // New: optional stat adjustments to be applied as user effects
  stat_adjustments?: Record<string, number>;
}

interface EditFighterResult {
  success: boolean;
  data?: {
    fighter?: any;
    gang?: {
      id: string;
      credits: number;
    };
    redirectTo?: string;
    xp?: number;
    total_xp?: number;
    kills?: number;
    kill_count?: number;
  };
  error?: string;
  fighter?: {
    id: string;
    fighter_name: string;
    label?: string;
    kills?: number;
    kill_count?: number;
    cost_adjustment?: number;
  };
}

export async function editFighterStatus(params: EditFighterStatusParams): Promise<EditFighterResult> {
  try {
    const supabase = await createClient();
    
    // Authenticate user (RLS handles permissions)
    await getAuthenticatedUser(supabase);
    

    // Get fighter information (RLS will handle permissions)
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select(`
        id,
        fighter_name,
        gang_id,
        credits,
        killed,
        retired,
        enslaved,
        starved,
        recovery,
        captured
      `)
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      throw new Error('Fighter not found');
    }

    // Get gang information
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('id, user_id, credits, rating, wealth')
      .eq('id', fighter.gang_id)
      .single();

    if (gangError || !gang) {
      throw new Error('Gang not found');
    }

    const gangId = fighter.gang_id;
    const gangCredits = gang.credits;

    // Helper to adjust rating and wealth by delta
    const adjustRating = async (delta: number, creditsDelta: number = 0) => {
      if (!delta && !creditsDelta) return;
      const newRating = Math.max(0, (gang.rating || 0) + delta);
      const newWealth = Math.max(0, (gang.wealth || 0) + delta + creditsDelta);

      await supabase
        .from('gangs')
        .update({
          rating: newRating,
          wealth: newWealth,
          last_updated: new Date().toISOString()
        })
        .eq('id', gangId);
      invalidateGangRating(gangId);
    };

    // Helper to compute effective fighter total cost (includes vehicles, effects, skills, beasts, adjustments)
    const getEffectiveCost = async () => {
      try {
        return await getFighterTotalCost(params.fighter_id, supabase);
      } catch (e) {
        console.error('Failed to compute fighter total cost for rating adjustment:', e);
        return 0;
      }
    };

    // Handle different actions
    switch (params.action) {
      case 'kill': {
        // Check if fighter is CURRENTLY active (before kill toggle)
        const wasActive = !fighter.killed && !fighter.retired && !fighter.enslaved;

        const willBeKilled = !fighter.killed;

        // Check if fighter WILL BE active (after kill toggle)
        const willBeActive = willBeKilled ? false : (!fighter.retired && !fighter.enslaved);

        // Delta = change in active status
        let delta = 0;
        if (wasActive && !willBeActive) {
          delta = -(await getEffectiveCost()); // Became inactive
        } else if (!wasActive && willBeActive) {
          delta = +(await getEffectiveCost()); // Became active
        }
        // else: stayed inactive, delta = 0

        const { data: updatedFighter, error: updateError } = await supabase
          .from('fighters')
          .update({
            killed: willBeKilled,
            updated_at: new Date().toISOString()
          })
          .eq('id', params.fighter_id)
          .select()
          .single();

        if (updateError) throw updateError;

        await adjustRating(delta);
        invalidateFighterData(params.fighter_id, gangId);
        await invalidateBeastOwnerCache(params.fighter_id, gangId, supabase);

        // Log fighter status change
        if (willBeKilled) {
          try {
            await logFighterAction({
              gang_id: gangId,
              fighter_id: params.fighter_id,
              fighter_name: fighter.fighter_name,
              action_type: 'fighter_killed'
            });
          } catch (logError) {
            console.error('Failed to log fighter killed:', logError);
          }
        } else {
          try {
            await logFighterAction({
              gang_id: gangId,
              fighter_id: params.fighter_id,
              fighter_name: fighter.fighter_name,
              action_type: 'fighter_resurected'
            });
          } catch (logError) {
            console.error('Failed to log fighter resurected:', logError);
          }
        }
        

        return {
          success: true,
          data: { fighter: updatedFighter }
        };
      }

      case 'retire': {
        // Check if fighter is CURRENTLY active (before retire toggle)
        const wasActive = !fighter.killed && !fighter.retired && !fighter.enslaved;

        const willBeRetired = !fighter.retired;

        // Check if fighter WILL BE active (after retire toggle)
        const willBeActive = willBeRetired ? false : (!fighter.killed && !fighter.enslaved);

        // Delta = change in active status
        let delta = 0;
        if (wasActive && !willBeActive) {
          delta = -(await getEffectiveCost()); // Became inactive
        } else if (!wasActive && willBeActive) {
          delta = +(await getEffectiveCost()); // Became active
        }
        // else: stayed inactive, delta = 0

        const { data: updatedFighter, error: updateError } = await supabase
          .from('fighters')
          .update({
            retired: willBeRetired,
            updated_at: new Date().toISOString()
          })
          .eq('id', params.fighter_id)
          .select()
          .single();

        if (updateError) throw updateError;

        await adjustRating(delta);
        invalidateFighterData(params.fighter_id, gangId);
        await invalidateBeastOwnerCache(params.fighter_id, gangId, supabase);

        // Log fighter status change
        if (willBeRetired) {
          try {
            await logFighterAction({
              gang_id: gangId,
              fighter_id: params.fighter_id,
              fighter_name: fighter.fighter_name,
              action_type: 'fighter_retired'
            });
          } catch (logError) {
            console.error('Failed to log fighter retired:', logError);
          }
        }

        return {
          success: true,
          data: { fighter: updatedFighter }
        };
      }

      case 'sell': {
        if (params.sell_value === undefined || params.sell_value === null || params.sell_value < 0) {
          throw new Error('Invalid sell value provided');
        }

        // Only subtract cost if fighter is currently active
        const isActive = !fighter.killed && !fighter.retired && !fighter.enslaved;
        const delta = isActive ? -(await getEffectiveCost()) : 0;

        // Update fighter to enslaved and add credits to gang
        const { data: updatedFighter, error: fighterUpdateError } = await supabase
          .from('fighters')
          .update({ 
            enslaved: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', params.fighter_id)
          .select()
          .single();

        if (fighterUpdateError) throw fighterUpdateError;

        // Update gang credits
        const { data: updatedGang, error: gangUpdateError} = await supabase
          .from('gangs')
          .update({
            credits: gangCredits + params.sell_value,
            last_updated: new Date().toISOString()
          })
          .eq('id', gangId)
          .select('id, credits')
          .single();

        if (gangUpdateError) throw gangUpdateError;

        // Update rating and wealth (credits delta is positive for sell)
        await adjustRating(delta, params.sell_value);
        invalidateFighterData(params.fighter_id, gangId);
        invalidateGangCredits(gangId);
        await invalidateBeastOwnerCache(params.fighter_id, gangId, supabase);

        // Log fighter enslaved
        try {
          await logFighterAction({
            gang_id: gangId,
            fighter_id: params.fighter_id,
            fighter_name: fighter.fighter_name,
            action_type: 'fighter_enslaved'
          });
        } catch (logError) {
          console.error('Failed to log fighter enslaved:', logError);
        }

        return {
          success: true,
          data: { 
            fighter: updatedFighter,
            gang: updatedGang
          }
        };
      }

      case 'rescue': {
        // Check if fighter is CURRENTLY active (before rescue)
        const wasActive = !fighter.killed && !fighter.retired && !fighter.enslaved;

        const { data: updatedFighter, error: updateError } = await supabase
          .from('fighters')
          .update({
            enslaved: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', params.fighter_id)
          .select()
          .single();

        if (updateError) throw updateError;

        // Check if fighter WILL BE active (after rescue)
        const willBeActive = !fighter.killed && !fighter.retired;

        // Delta = change in active status
        let delta = 0;
        if (!wasActive && willBeActive) {
          delta = +(await getEffectiveCost()); // Became active
        }
        // else: stayed inactive (still killed or retired), delta = 0

        await adjustRating(delta);

        // Log fighter rescue
        try {
          await logFighterAction({
            gang_id: gangId,
            fighter_id: params.fighter_id,
            fighter_name: fighter.fighter_name,
            action_type: 'fighter_rescued'
          });
        } catch (logError) {
          console.error('Failed to log fighter rescue:', logError);
        }

        invalidateFighterData(params.fighter_id, gangId);
        await invalidateBeastOwnerCache(params.fighter_id, gangId, supabase);

        return {
          success: true,
          data: { fighter: updatedFighter }
        };
      }

      case 'starve': {
        if (fighter.starved) {
          // Feeding the fighter: check for meat and consume it
          // Fetch current meat value
          const { data: gangMeatData, error: gangMeatError } = await supabase
            .from('gangs')
            .select('meat')
            .eq('id', gangId)
            .single();

          if (gangMeatError || gangMeatData == null) {
            throw new Error('Could not fetch gang meat value');
          }

          if ((gangMeatData.meat ?? 0) < 1) {
            return {
              success: false,
              error: 'Not enough meat to feed fighter'
            };
          }

          // Decrement meat and set starved = false in a transaction-like sequence
          const { error: meatUpdateError } = await supabase
            .from('gangs')
            .update({ meat: gangMeatData.meat - 1, last_updated: new Date().toISOString() })
            .eq('id', gangId);

          if (meatUpdateError) throw meatUpdateError;

          const { data: updatedFighter, error: updateError } = await supabase
            .from('fighters')
            .update({ 
              starved: false,
              updated_at: new Date().toISOString()
            })
            .eq('id', params.fighter_id)
            .select()
            .single();

          if (updateError) throw updateError;

          // Log fighter feeding
          try {
            await logFighterAction({
              gang_id: gangId,
              fighter_id: params.fighter_id,
              fighter_name: fighter.fighter_name,
              action_type: 'fighter_fed'
            });
          } catch (logError) {
            console.error('Failed to log fighter feeding:', logError);
          }

          invalidateFighterData(params.fighter_id, gangId);
        await invalidateBeastOwnerCache(params.fighter_id, gangId, supabase);

          return {
            success: true,
            data: { fighter: updatedFighter }
          };
        } else {
          // Starving the fighter (no meat logic)
          const { data: updatedFighter, error: updateError } = await supabase
            .from('fighters')
            .update({ 
              starved: true,
              updated_at: new Date().toISOString()
            })
            .eq('id', params.fighter_id)
            .select()
            .single();

          if (updateError) throw updateError;

          // Log fighter starving
          try {
            await logFighterAction({
              gang_id: gangId,
              fighter_id: params.fighter_id,
              fighter_name: fighter.fighter_name,
              action_type: 'fighter_starved'
            });
          } catch (logError) {
            console.error('Failed to log fighter starving:', logError);
          }

          invalidateFighterData(params.fighter_id, gangId);
        await invalidateBeastOwnerCache(params.fighter_id, gangId, supabase);

          return {
            success: true,
            data: { fighter: updatedFighter }
          };
        }
      }

      case 'recover': {
        const { data: updatedFighter, error: updateError } = await supabase
          .from('fighters')
          .update({ 
            recovery: !fighter.recovery,
            updated_at: new Date().toISOString()
          })
          .eq('id', params.fighter_id)
          .select()
          .single();

        if (updateError) throw updateError;

        // Log the recovery status change
        const recoveryType = !!fighter.recovery ? 'recovered' : 'sent_to_recovery';
        await logFighterRecovery({
          gang_id: gangId,
          fighter_id: params.fighter_id,
          fighter_name: fighter.fighter_name,
          recovery_type: recoveryType
        });

        invalidateFighterData(params.fighter_id, gangId);
        await invalidateBeastOwnerCache(params.fighter_id, gangId, supabase);

        return {
          success: true,
          data: { fighter: updatedFighter }
        };
      }

      case 'capture': {
        const { data: updatedFighter, error: updateError } = await supabase
          .from('fighters')
          .update({ 
            captured: !fighter.captured,
            updated_at: new Date().toISOString()
          })
          .eq('id', params.fighter_id)
          .select()
          .single();

        if (updateError) throw updateError;

        // Log fighter capture/release
        try {
          const actionType = !fighter.captured ? 'fighter_captured' : 'fighter_released';
          await logFighterAction({
            gang_id: gangId,
            fighter_id: params.fighter_id,
            fighter_name: fighter.fighter_name,
            action_type: actionType
          });
        } catch (logError) {
          console.error('Failed to log fighter capture/release:', logError);
        }

        invalidateFighterData(params.fighter_id, gangId);
        await invalidateBeastOwnerCache(params.fighter_id, gangId, supabase);

        return {
          success: true,
          data: { fighter: updatedFighter }
        };
      }

      case 'delete': {
        // Subtract effective cost only if fighter is currently active
        const isActive = !fighter.killed && !fighter.retired && !fighter.enslaved;
        const delta = isActive ? -(await getEffectiveCost()) : 0;

        // Delete the fighter
        const { error: deleteError } = await supabase
          .from('fighters')
          .delete()
          .eq('id', params.fighter_id);

        if (deleteError) throw deleteError;

        // Clean up fighter images from storage
        try {
          // List files in the fighters directory to find the fighter's images
          const { data: files } = await supabase.storage
            .from('users-images')
            .list(`gangs/${gangId}/fighters/`);

          const filesToRemove: string[] = [];

          if (files) {
            // Find all files that start with the fighter ID
            files.forEach(file => {
              if (file.name.startsWith(`${params.fighter_id}_`) || file.name === `${params.fighter_id}.webp`) {
                filesToRemove.push(`gangs/${gangId}/fighters/${file.name}`);
              }
            });
          }

          // Remove all matching files
          if (filesToRemove.length > 0) {
            await supabase.storage
              .from('users-images')
              .remove(filesToRemove);
          }
        } catch (imageError) {
          // Log the error but don't fail the fighter deletion
          console.error('Error cleaning up fighter images:', imageError);
        }

        await adjustRating(delta);
        invalidateFighterData(params.fighter_id, gangId);
        revalidateTag(CACHE_TAGS.COMPUTED_GANG_FIGHTER_COUNT(gangId));
        await invalidateBeastOwnerCache(params.fighter_id, gangId, supabase);

        // Log fighter removal
        try {
          const fighterCredits = await calculateFighterCredits(params.fighter_id);
          await logFighterAction({
            gang_id: gangId,
            fighter_id: params.fighter_id,
            fighter_name: fighter.fighter_name,
            action_type: 'fighter_removed',
            fighter_credits: fighterCredits,
            status_reason: fighter.killed ? 'killed' : fighter.retired ? 'retired' : fighter.enslaved ? 'enslaved' : null
          });
        } catch (logError) {
          console.error('Failed to log fighter removal:', logError);
        }

        return {
          success: true,
          data: { 
            redirectTo: `/gang/${gangId}`
          }
        };
      }

      default:
        throw new Error('Invalid action specified');
    }

  } catch (error) {
    console.error('Error in editFighterStatus server action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

export async function updateFighterXp(params: UpdateFighterXpParams): Promise<EditFighterResult> {
  try {
    const supabase = await createClient();
    
    const user = await getAuthenticatedUser(supabase);

    // Get fighter data (RLS will handle permissions)
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, gang_id, xp, fighter_name')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      throw new Error('Fighter not found');
    }

    // Update XP
    const { data: updatedFighter, error: updateError } = await supabase
      .from('fighters')
      .update({ 
        xp: fighter.xp + params.xp_to_add,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.fighter_id)
      .select('id, xp')
      .single();

    if (updateError) throw updateError;

    // Log XP change
    try {
      await logFighterAction({
        gang_id: fighter.gang_id,
        fighter_id: params.fighter_id,
        fighter_name: fighter.fighter_name,
        action_type: 'fighter_xp_changed',
        old_value: fighter.xp,
        new_value: updatedFighter.xp,
        user_id: user.id
      });
    } catch (logError) {
      console.error('Failed to log fighter XP change:', logError);
    }

    // Invalidate cache - surgical XP-only invalidation
    revalidateTag(CACHE_TAGS.BASE_FIGHTER_BASIC(params.fighter_id));
    revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(fighter.gang_id));
    await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase);

    return {
      success: true,
      data: { 
        fighter: updatedFighter,
        xp: updatedFighter.xp,
        total_xp: updatedFighter.xp
      }
    };
  } catch (error) {
    console.error('Error updating fighter XP:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

export interface UpdateFighterXpWithOoaParams {
  fighter_id: string;
  xp_to_add: number;
  ooa_count?: number; // Number of OOA actions to add to kills
}

export async function updateFighterXpWithOoa(params: UpdateFighterXpWithOoaParams): Promise<EditFighterResult> {
  try {
    const supabase = await createClient();
    
    const user = await getAuthenticatedUser(supabase);

    // Get fighter data (RLS will handle permissions)
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, gang_id, xp, kills, kill_count, fighter_name, fighter_type_id, fighter_types(is_spyrer)')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      throw new Error('Fighter not found');
    }

    // Type-safe access to fighter_types (may be null for custom fighters)
    const fighterTypes = fighter.fighter_types;
    const isSpyrer = fighterTypes && typeof fighterTypes === 'object' && 'is_spyrer' in fighterTypes
      ? fighterTypes.is_spyrer || false
      : false;

    // Calculate new values
    const newXp = fighter.xp + params.xp_to_add;
    const newKills = fighter.kills + (params.ooa_count || 0);
    const newKillCount = isSpyrer ? (fighter.kill_count || 0) + (params.ooa_count || 0) : fighter.kill_count;

    // Update XP, kills, and kill_count
    const updateData: any = {
      xp: newXp,
      kills: newKills,
      updated_at: new Date().toISOString()
    };

    if (newKillCount !== undefined) {
      updateData.kill_count = newKillCount;
    }

    const { data: updatedFighter, error: updateError } = await supabase
      .from('fighters')
      .update(updateData)
      .eq('id', params.fighter_id)
      .select('id, xp, kills, kill_count')
      .single();

    if (updateError) throw updateError;

    // Log XP change
    try {
      await logFighterAction({
        gang_id: fighter.gang_id,
        fighter_id: params.fighter_id,
        fighter_name: fighter.fighter_name,
        action_type: 'fighter_xp_changed',
        old_value: fighter.xp,
        new_value: updatedFighter.xp,
        user_id: user.id
      });
    } catch (logError) {
      console.error('Failed to log fighter XP change:', logError);
    }

    // Log kills change if OOA count was provided
    if (params.ooa_count && params.ooa_count > 0) {
      try {
        await logFighterAction({
          gang_id: fighter.gang_id,
          fighter_id: params.fighter_id,
          fighter_name: fighter.fighter_name,
          action_type: 'fighter_OOA_changed',
          old_value: fighter.kills,
          new_value: updatedFighter.kills,
          user_id: user.id
        });
      } catch (logError) {
        console.error('Failed to log fighter kills change:', logError);
      }
    }

    // Invalidate cache - surgical XP-only invalidation
    revalidateTag(CACHE_TAGS.BASE_FIGHTER_BASIC(params.fighter_id));
    revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(fighter.gang_id));
    await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase);

    return {
      success: true,
      data: {
        fighter: updatedFighter,
        xp: updatedFighter.xp,
        total_xp: updatedFighter.xp,
        kills: updatedFighter.kills,
        kill_count: updatedFighter.kill_count
      }
    };
  } catch (error) {
    console.error('Error updating fighter XP with OOA:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

export async function updateFighterDetails(params: UpdateFighterDetailsParams): Promise<EditFighterResult> {
  try {
    const supabase = await createClient();
    
    
    const user = await getAuthenticatedUser(supabase);

    // Get fighter data (RLS will handle permissions)
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, gang_id, cost_adjustment, killed, retired, enslaved, fighter_name')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      throw new Error('Fighter not found');
    }

    const wasActive = !fighter.killed && !fighter.retired && !fighter.enslaved;
    const previousAdjustment = fighter.cost_adjustment || 0;

    // Build update object with only provided fields
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (params.fighter_name !== undefined) updateData.fighter_name = params.fighter_name.trimEnd();
    if (params.label !== undefined) updateData.label = params.label;
    if (params.kills !== undefined) updateData.kills = params.kills;
    if (params.kill_count !== undefined) updateData.kill_count = params.kill_count;
    if (params.cost_adjustment !== undefined) updateData.cost_adjustment = params.cost_adjustment;
    if (params.special_rules !== undefined) updateData.special_rules = params.special_rules;
    if (params.fighter_class !== undefined) updateData.fighter_class = params.fighter_class;
    if (params.fighter_class_id !== undefined) updateData.fighter_class_id = params.fighter_class_id;
    if (params.fighter_type !== undefined) updateData.fighter_type = params.fighter_type;
    if (params.fighter_type_id !== undefined) updateData.fighter_type_id = params.fighter_type_id;
    if (params.fighter_sub_type !== undefined) updateData.fighter_sub_type = params.fighter_sub_type;
    if (params.fighter_sub_type_id !== undefined) updateData.fighter_sub_type_id = params.fighter_sub_type_id;
    if (params.note !== undefined) updateData.note = params.note;
    if (params.note_backstory !== undefined) updateData.note_backstory = params.note_backstory;
    if (params.fighter_gang_legacy_id !== undefined) updateData.fighter_gang_legacy_id = params.fighter_gang_legacy_id;


    // Update fighter
    const { data: updatedFighter, error: updateError } = await supabase
      .from('fighters')
      .update(updateData)
      .eq('id', params.fighter_id)
      .select('id, fighter_name, label, kills, kill_count, cost_adjustment')
      .single();

    if (updateError) throw updateError;

    // If cost_adjustment changed and fighter is active, update rating by delta
    let costAdjustmentDelta = 0;
    if (params.cost_adjustment !== undefined && wasActive) {
      costAdjustmentDelta = (params.cost_adjustment || 0) - previousAdjustment;
      if (costAdjustmentDelta !== 0) {
        try {
          const { data: ratingRow } = await supabase
            .from('gangs')
            .select('rating')
            .eq('id', fighter.gang_id)
            .single();
          const currentRating = (ratingRow?.rating ?? 0) as number;
          await supabase
            .from('gangs')
            .update({ rating: Math.max(0, currentRating + costAdjustmentDelta) })
            .eq('id', fighter.gang_id);
          invalidateGangRating(fighter.gang_id);
        } catch (e) {
          console.error('Failed to update rating after cost_adjustment change:', e);
        }
      }
    }

    // If there are stat adjustments, apply them using the existing effects system (user effects via fighter_effect_types)
    if (params.stat_adjustments && Object.keys(params.stat_adjustments).length > 0) {
      try {
        // Fetch effect types for the 'user' category (same as API route)
        const USER_EFFECT_CATEGORY_ID = '3d582ae1-2c18-4e1a-93a9-0c7c5731a96a';
        const { data: effectTypes, error: typesError } = await supabase
          .from('fighter_effect_types')
          .select(`
            id,
            effect_name,
            fighter_effect_type_modifiers (
              id,
              stat_name,
              default_numeric_value
            )
          `)
          .eq('fighter_effect_category_id', USER_EFFECT_CATEGORY_ID);

        if (typesError) throw typesError;

        const user = await getAuthenticatedUser(supabase);

        // Helper to find matching effect type for a stat and delta sign
        const findEffectTypeFor = (statName: string, delta: number) => {
          return (effectTypes as any[])?.find((et: any) =>
            et.fighter_effect_type_modifiers?.some((m: any) =>
              m.stat_name === statName && Math.sign(m.default_numeric_value) === Math.sign(delta)
            )
          );
        };

        let effectsChanged = false;
        for (const [statName, delta] of Object.entries(params.stat_adjustments)) {
          const changeValue = Number(delta);
          if (!changeValue || changeValue === 0) continue;
          const effectType = findEffectTypeFor(statName, changeValue);
          if (!effectType) continue;

          // Create effect row
          const { data: newEffect, error: effectError } = await supabase
            .from('fighter_effects')
            .insert({
              fighter_id: params.fighter_id,
              fighter_effect_type_id: effectType.id,
              effect_name: effectType.effect_name,
              user_id: user.id
            })
            .select('id')
            .single();

          if (effectError) throw effectError;

          // Create modifier with signed delta
          const { error: modifierError } = await supabase
            .from('fighter_effect_modifiers')
            .insert({
              fighter_effect_id: newEffect.id,
              stat_name: statName,
              numeric_value: changeValue.toString()
            });
          if (modifierError) throw modifierError;
          effectsChanged = true;
        }

        // Invalidate caches only if effects actually changed
        if (effectsChanged) {
          // Use explicit cache tags for effect changes
          revalidateTag(CACHE_TAGS.BASE_FIGHTER_EFFECTS(params.fighter_id));
          revalidateTag(CACHE_TAGS.COMPUTED_FIGHTER_TOTAL_COST(params.fighter_id));
          revalidateTag(CACHE_TAGS.COMPUTED_GANG_RATING(fighter.gang_id));
          revalidateTag(CACHE_TAGS.SHARED_FIGHTER_COST(params.fighter_id));
          revalidateTag(CACHE_TAGS.SHARED_GANG_RATING(fighter.gang_id));
          revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(fighter.gang_id));
        }
      } catch (e) {
        console.error('Failed to apply stat adjustments:', e);
      }
    }

    // Log relevant fighter changes
    try {
      if (params.kills !== undefined && updatedFighter.kills !== undefined) {
        await logFighterAction({
          gang_id: fighter.gang_id,
          fighter_id: params.fighter_id,
          fighter_name: updatedFighter.fighter_name,
          action_type: 'fighter_kills_changed',
          old_value: 0, // We don't have the old value easily accessible
          new_value: updatedFighter.kills,
          user_id: user.id
        });
      }

      if (params.cost_adjustment !== undefined && costAdjustmentDelta !== 0) {
        await logFighterAction({
          gang_id: fighter.gang_id,
          fighter_id: params.fighter_id,
          fighter_name: updatedFighter.fighter_name,
          action_type: 'fighter_cost_adjusted',
          old_value: previousAdjustment,
          new_value: params.cost_adjustment,
          user_id: user.id
        });
      }
    } catch (logError) {
      console.error('Failed to log fighter details changes:', logError);
    }

    // Invalidate cache (already handles BASE_FIGHTER_BASIC and COMPOSITE_GANG_FIGHTERS_LIST)
    invalidateFighterData(params.fighter_id, fighter.gang_id);
    await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase);

    // If fighter name changed, invalidate ownership info for any beasts owned by this fighter
    if (params.fighter_name !== undefined && params.fighter_name.trimEnd() !== fighter.fighter_name) {
      // Only query if the name actually changed
      const { data: ownedBeasts } = await supabase
        .from('fighter_exotic_beasts')
        .select('id')
        .eq('fighter_owner_id', params.fighter_id);

      // Only invalidate if this fighter actually owns exotic beasts
      if (ownedBeasts && ownedBeasts.length > 0) {
        ownedBeasts.forEach(beast => {
          revalidateTag(`fighter-exotic-beast-${beast.id}`);
        });
      }
    }

    return {
      success: true,
      data: { 
        fighter: updatedFighter
      }
    };
  } catch (error) {
    console.error('Error updating fighter details:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
} 