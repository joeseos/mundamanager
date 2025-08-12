'use server'

import { createClient } from "@/utils/supabase/server";
import { invalidateFighterData, invalidateGangCredits, CACHE_TAGS, invalidateGangRating } from '@/utils/cache-tags';
import { revalidateTag } from 'next/cache';
import { logFighterRecovery } from './logs/gang-fighter-logs';
import { getAuthenticatedUser } from '@/utils/auth';
import { getFighterTotalCost } from '@/app/lib/shared/fighter-data';

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
  };
  error?: string;
  fighter?: {
    id: string;
    fighter_name: string;
    label?: string;
    kills?: number;
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
        invalidateFighterData(params.fighter_id, gangId);
        await invalidateBeastOwnerCache(params.fighter_id, gangId, supabase);

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
        invalidateFighterData(params.fighter_id, gangId);
        await invalidateBeastOwnerCache(params.fighter_id, gangId, supabase);

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
        invalidateFighterData(params.fighter_id, gangId);
        invalidateGangCredits(gangId);
        await invalidateBeastOwnerCache(params.fighter_id, gangId, supabase);

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
        await invalidateBeastOwnerCache(params.fighter_id, gangId, supabase);

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
      .select('id, gang_id, xp')
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

export async function updateFighterDetails(params: UpdateFighterDetailsParams): Promise<EditFighterResult> {
  try {
    const supabase = await createClient();
    
    
    const user = await getAuthenticatedUser(supabase);

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


    // Update fighter
    const { data: updatedFighter, error: updateError } = await supabase
      .from('fighters')
      .update(updateData)
      .eq('id', params.fighter_id)
      .select('id, fighter_name, label, kills, cost_adjustment')
      .single();

    if (updateError) throw updateError;

    // If cost_adjustment changed and fighter is active, update rating by delta
    if (params.cost_adjustment !== undefined && wasActive) {
      const delta = (params.cost_adjustment || 0) - previousAdjustment;
      if (delta !== 0) {
        try {
          const { data: ratingRow } = await supabase
            .from('gangs')
            .select('rating')
            .eq('id', fighter.gang_id)
            .single();
          const currentRating = (ratingRow?.rating ?? 0) as number;
          await supabase
            .from('gangs')
            .update({ rating: Math.max(0, currentRating + delta) })
            .eq('id', fighter.gang_id);
          invalidateGangRating(fighter.gang_id);
        } catch (e) {
          console.error('Failed to update rating after cost_adjustment change:', e);
        }
      }
    }

    // Invalidate cache
    invalidateFighterData(params.fighter_id, fighter.gang_id);
    await invalidateBeastOwnerCache(params.fighter_id, fighter.gang_id, supabase);
    
    // Additional cache invalidation for notes
    if (params.note !== undefined || params.note_backstory !== undefined) {
      // Invalidate fighter basic data (includes notes)
      revalidateTag(CACHE_TAGS.BASE_FIGHTER_BASIC(params.fighter_id));
      // Invalidate composite gang data that includes fighter information
      revalidateTag(CACHE_TAGS.COMPOSITE_GANG_FIGHTERS_LIST(fighter.gang_id));
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