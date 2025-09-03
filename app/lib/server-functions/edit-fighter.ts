'use server'

import { createClient } from "@/utils/supabase/server";
import { getAuthenticatedUser } from "@/utils/auth";
import { getFighterTotalCost } from '@/app/lib/fighter-data';
import { logFighterAction, calculateFighterCredits } from '@/app/actions/logs/fighter-logs';
import { logFighterRecovery } from '@/app/actions/logs/gang-fighter-logs';

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
    // Cache invalidation handled by TanStack Query optimistic updates
    // The owner's cache will be invalidated through the mutation's onSuccess callback
  }
}

// Equipment operation types
export interface EditFighterStatusParams {
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
}

export interface UpdateFighterEffectsParams {
  fighter_id: string;
  stats: Record<string, number>; // e.g., { movement: 1, weapon_skill: -1 }
}

export interface EditFighterResult {
  fighter?: any;
  gang?: {
    id: string;
    credits: number;
  };
  redirectTo?: string;
  xp?: number;
  total_xp?: number;
  kills?: number;
}

export async function editFighterStatus(params: EditFighterStatusParams): Promise<ServerFunctionResult<EditFighterResult>> {
  try {
    const { user, supabase } = await createServerContext();

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
      .select('id, user_id, credits, rating')
      .eq('id', fighter.gang_id)
      .single();

    if (gangError || !gang) {
      throw new Error('Gang not found');
    }

    const gangId = fighter.gang_id;
    const gangCredits = gang.credits;

    // Helper to adjust rating by delta
    const adjustRating = async (delta: number) => {
      if (!delta) return;
      const newRating = Math.max(0, (gang.rating || 0) + delta);
      await supabase.from('gangs').update({ rating: newRating, last_updated: new Date().toISOString() }).eq('id', gangId);
      // Cache invalidation handled by TanStack Query optimistic updates
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
        const wasKilled = !!fighter.killed;
        const willBeKilled = !fighter.killed;
        const delta = willBeKilled ? -(await getEffectiveCost()) : +(await getEffectiveCost());

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
        }

        return {
          success: true,
          data: { fighter: updatedFighter }
        };
      }

      case 'retire': {
        const willBeRetired = !fighter.retired;
        const delta = willBeRetired ? -(await getEffectiveCost()) : +(await getEffectiveCost());

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

        // Subtract effective cost before changing status
        const delta = -(await getEffectiveCost());

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
        const { data: updatedGang, error: gangUpdateError } = await supabase
          .from('gangs')
          .update({ 
            credits: gangCredits + params.sell_value,
            last_updated: new Date().toISOString()
          })
          .eq('id', gangId)
          .select('id, credits')
          .single();

        if (gangUpdateError) throw gangUpdateError;

        await adjustRating(delta);
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

        // Add back effective cost after making fighter active
        const delta = +(await getEffectiveCost());
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
            files.forEach((file: { name: string }) => {
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
    console.error('Error in editFighterStatus server function:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

export async function updateFighterXp(params: UpdateFighterXpParams): Promise<ServerFunctionResult<EditFighterResult>> {
  try {
    const { user, supabase } = await createServerContext();

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

export async function updateFighterXpWithOoa(params: UpdateFighterXpWithOoaParams): Promise<ServerFunctionResult<EditFighterResult>> {
  try {
    const { user, supabase } = await createServerContext();

    // Get fighter data (RLS will handle permissions)
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, gang_id, xp, kills, fighter_name')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      throw new Error('Fighter not found');
    }

    // Calculate new values
    const newXp = fighter.xp + params.xp_to_add;
    const newKills = fighter.kills + (params.ooa_count || 0);

    // Update XP and kills
    const { data: updatedFighter, error: updateError } = await supabase
      .from('fighters')
      .update({ 
        xp: newXp,
        kills: newKills,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.fighter_id)
      .select('id, xp, kills')
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
          action_type: 'fighter_kills_changed',
          old_value: fighter.kills,
          new_value: updatedFighter.kills,
          user_id: user.id
        });
      } catch (logError) {
        console.error('Failed to log fighter kills change:', logError);
      }
    }

    await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase);

    return {
      success: true,
      data: { 
        fighter: updatedFighter,
        xp: updatedFighter.xp,
        total_xp: updatedFighter.xp,
        kills: updatedFighter.kills
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

export async function updateFighterDetails(params: UpdateFighterDetailsParams): Promise<ServerFunctionResult<EditFighterResult>> {
  try {
    const { user, supabase } = await createServerContext();

    // Get fighter data (RLS will handle permissions)
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, gang_id, cost_adjustment, killed, retired, enslaved')
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
      .select('id, fighter_name, label, kills, cost_adjustment')
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
          // Cache invalidation handled by TanStack Query optimistic updates
        } catch (e) {
          console.error('Failed to update rating after cost_adjustment change:', e);
        }
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

    await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase);

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

export async function updateFighterEffects(params: UpdateFighterEffectsParams): Promise<ServerFunctionResult<EditFighterResult>> {
  try {
    const { user, supabase } = await createServerContext();

    // Get fighter data (RLS will handle permissions)
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, gang_id, fighter_name')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      throw new Error('Fighter not found');
    }

    // First, get all effect types for user modifications (same as API route)
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
      .eq('fighter_effect_category_id', '3d582ae1-2c18-4e1a-93a9-0c7c5731a96a');

    if (typesError) {
      console.error('Error fetching effect types:', typesError);
      throw typesError;
    }

    // Fetch existing user effects for this fighter
    const { data: existingEffects, error: fetchError } = await supabase
      .from('fighter_effects')
      .select(`
        id,
        fighter_effect_type_id,
        fighter_effect_modifiers (
          id,
          stat_name,
          numeric_value
        )
      `)
      .eq('fighter_id', params.fighter_id)
      .eq('user_id', user.id)
      .in('fighter_effect_type_id', (effectTypes as any[]).map(et => et.id));

    if (fetchError) {
      console.error('Error fetching existing effects:', fetchError);
      throw fetchError;
    }

    // Group existing modifiers by stat_name for quick lookup
    const existingModifiersByStat: Record<string, any[]> = {};
    (existingEffects as any[])?.forEach(effect => {
      effect.fighter_effect_modifiers?.forEach((modifier: any) => {
        const statName = modifier.stat_name;
        if (!existingModifiersByStat[statName]) {
          existingModifiersByStat[statName] = [];
        }
        existingModifiersByStat[statName].push({
          id: modifier.id,
          effect_id: effect.id,
          stat_name: statName,
          numeric_value: parseInt(modifier.numeric_value)
        });
      });
    });

    // Track modifiers to delete and effects to delete
    const modifiersToDelete: string[] = [];
    const effectsToDelete: string[] = [];

    // Process each stat change (same logic as API route)
    for (const [statName, changeValue] of Object.entries(params.stats)) {
      if (changeValue === 0) continue;
      
      // Check if we have existing modifiers for this stat
      if (existingModifiersByStat[statName] && existingModifiersByStat[statName].length > 0) {
        
        // Find modifiers with the same sign as our change (for consolidation)
        const sameSignModifiers = existingModifiersByStat[statName].filter(
          mod => Math.sign(mod.numeric_value) === Math.sign(changeValue)
        );
        
        // Find modifiers with the opposite sign as our change (for cancellation)
        const oppositeSignModifiers = existingModifiersByStat[statName].filter(
          mod => Math.sign(mod.numeric_value) !== Math.sign(changeValue)
        );
        
        // Case 1: We have existing modifiers with the same sign - consolidate them
        if (sameSignModifiers.length > 0) {
          // Get the first modifier to update (we'll consolidate all into this one)
          const primaryMod = sameSignModifiers[0];
          const newValue = primaryMod.numeric_value + changeValue;
          
          // If the new value would be 0, delete this modifier instead of updating it
          if (newValue === 0) {
            modifiersToDelete.push(primaryMod.id);
            
            // Check if this was the only modifier for its effect
            const effect = (existingEffects as any[]).find(ef => ef.id === primaryMod.effect_id);
            if (effect && effect.fighter_effect_modifiers.length === 1) {
              effectsToDelete.push(effect.id);
            }
          } else {
            // Update the primary modifier with the new value
            const { error: updateModifierError } = await supabase
              .from('fighter_effect_modifiers')
              .update({
                numeric_value: newValue.toString()
              })
              .eq('id', primaryMod.id);

            if (updateModifierError) {
              console.error('Error updating modifier:', updateModifierError);
              throw updateModifierError;
            }
          }
          
          // Delete any other modifiers of the same sign (consolidate them)
          const otherSameSignModifiers = sameSignModifiers.slice(1);
          if (otherSameSignModifiers.length > 0) {
            modifiersToDelete.push(...otherSameSignModifiers.map(mod => mod.id));
            
            // Check if any of these were the only modifier for their effects
            otherSameSignModifiers.forEach(mod => {
              const effect = (existingEffects as any[]).find(ef => ef.id === mod.effect_id);
              if (effect && effect.fighter_effect_modifiers.length === 1) {
                effectsToDelete.push(effect.id);
              }
            });
          }
          
          // We've handled this stat fully, continue to the next one
          continue;
        }
        
        // Case 2: We have modifiers with opposite signs - handle cancellation
        if (oppositeSignModifiers.length > 0) {
          let remainingChange = changeValue;
          
          // Process each opposite sign modifier until our change is fully applied
          for (const mod of oppositeSignModifiers) {
            // If these would cancel out completely
            if (Math.abs(mod.numeric_value) === Math.abs(remainingChange)) {
              modifiersToDelete.push(mod.id);
              
              // Check if this was the only modifier for its effect
              const effect = (existingEffects as any[]).find(ef => ef.id === mod.effect_id);
              if (effect && effect.fighter_effect_modifiers.length === 1) {
                effectsToDelete.push(effect.id);
              }
              
              remainingChange = 0;
              break;
            }
            // If our change is smaller (partial cancellation)
            else if (Math.abs(remainingChange) < Math.abs(mod.numeric_value)) {
              // Calculate the new value properly preserving signs
              const newValue = mod.numeric_value + remainingChange;
              
              // Update the modifier with the new value
              const { error: updateModifierError } = await supabase
                .from('fighter_effect_modifiers')
                .update({
                  numeric_value: newValue.toString()
                })
                .eq('id', mod.id);

              if (updateModifierError) {
                console.error('Error updating modifier:', updateModifierError);
                throw updateModifierError;
              }
              
              remainingChange = 0;
              break;
            }
            // If our change is larger (complete this cancellation and continue)
            else {
              modifiersToDelete.push(mod.id);
              
              // Check if this was the only modifier for its effect
              const effect = (existingEffects as any[]).find(ef => ef.id === mod.effect_id);
              if (effect && effect.fighter_effect_modifiers.length === 1) {
                effectsToDelete.push(effect.id);
              }
              
              remainingChange += mod.numeric_value; // This will reduce the magnitude of remainingChange
            }
          }
          
          // If we still have remaining change value, create a new effect for it
          if (remainingChange !== 0 && !sameSignModifiers.length) {
            await createNewEffect(
              supabase,
              params.fighter_id,
              user.id,
              statName,
              remainingChange,
              effectTypes as any[]
            );
          }
          
          // We've handled this stat fully, continue to the next one
          continue;
        }
      } else {
        // Case 3: No existing modifiers, create a new effect
        await createNewEffect(
          supabase,
          params.fighter_id,
          user.id,
          statName,
          changeValue,
          effectTypes as any[]
        );
      }
    }
    
    // Delete any modifiers we marked for deletion
    if (modifiersToDelete.length > 0) {
      const { error: deleteModifiersError } = await supabase
        .from('fighter_effect_modifiers')
        .delete()
        .in('id', modifiersToDelete);
        
      if (deleteModifiersError) {
        console.error('Error deleting modifiers:', deleteModifiersError);
        throw deleteModifiersError;
      }
    }
    
    // Delete any effects we marked for deletion
    if (effectsToDelete.length > 0) {
      const { error: deleteEffectsError } = await supabase
        .from('fighter_effects')
        .delete()
        .in('id', effectsToDelete);
        
      if (deleteEffectsError) {
        console.error('Error deleting effects:', deleteEffectsError);
        throw deleteEffectsError;
      }
    }

    // Log the effects update
    try {
      await logFighterAction({
        gang_id: fighter.gang_id,
        fighter_id: params.fighter_id,
        fighter_name: fighter.fighter_name,
        action_type: 'fighter_xp_changed', // Using existing action type for now
        user_id: user.id
      });
    } catch (logError) {
      console.error('Failed to log fighter effects update:', logError);
    }

    await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase);

    return {
      success: true,
      data: { 
        fighter: { id: fighter.id }
      }
    };
  } catch (error) {
    console.error('Error updating fighter effects:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}

// Helper function to create a new effect and modifier (copied from API route)
async function createNewEffect(
  supabase: any,
  fighter_id: string,
  user_id: string,
  statName: string,
  changeValue: number,
  effectTypes: any[]
) {
  // Find the appropriate effect type for this stat and change direction
  const effectType = effectTypes.find(et => 
    et.fighter_effect_type_modifiers.some((m: any) => 
      m.stat_name === statName && 
      Math.sign(m.default_numeric_value) === Math.sign(changeValue)
    )
  );

  if (!effectType) {
    return;
  }

  // Create the effect
  const { data: newEffect, error: effectError } = await supabase
    .from('fighter_effects')
    .insert({
      fighter_id,
      fighter_effect_type_id: effectType.id,
      effect_name: effectType.effect_name,
      user_id
    })
    .select()
    .single();

  if (effectError) {
    console.error('Error creating effect:', effectError);
    throw effectError;
  }

  // Create the modifier - IMPORTANT: Use the actual changeValue, not its absolute value
  const modifierData = {
    fighter_effect_id: newEffect.id,
    stat_name: statName,
    numeric_value: changeValue.toString()  // Keep negative values
  };
  
  const { error: modifierError } = await supabase
    .from('fighter_effect_modifiers')
    .insert(modifierData);

  if (modifierError) {
    console.error('Error creating modifier:', modifierError);
    throw modifierError;
  }
  
  return newEffect;
}
