'use server'

import { createClient } from "@/utils/supabase/server";
import { invalidateFighterData, invalidateGangCredits } from '@/utils/cache-tags';
import { logFighterRecovery } from './logs/gang-fighter-logs';

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
  action: 'kill' | 'retire' | 'sell' | 'rescue' | 'starve' | 'recover' | 'delete';
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
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

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
        recovery
      `)
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      throw new Error('Fighter not found');
    }

    // Get gang information
    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select('id, user_id, credits')
      .eq('id', fighter.gang_id)
      .single();

    if (gangError || !gang) {
      throw new Error('Gang not found');
    }

    const gangId = fighter.gang_id;
    const gangCredits = gang.credits;

    // Handle different actions
    switch (params.action) {
      case 'kill': {
        const { data: updatedFighter, error: updateError } = await supabase
          .from('fighters')
          .update({ 
            killed: !fighter.killed,
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

      case 'retire': {
        const { data: updatedFighter, error: updateError } = await supabase
          .from('fighters')
          .update({ 
            retired: !fighter.retired,
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

      case 'sell': {
        if (!params.sell_value || params.sell_value < 0) {
          throw new Error('Invalid sell value provided');
        }

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

        invalidateFighterData(params.fighter_id, gangId);
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

      case 'delete': {
        // Delete the fighter
        const { error: deleteError } = await supabase
          .from('fighters')
          .delete()
          .eq('id', params.fighter_id);

        if (deleteError) throw deleteError;

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
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

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

    // Invalidate cache
    invalidateFighterData(params.fighter_id, fighter.gang_id);
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
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Get fighter data (RLS will handle permissions)
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, gang_id')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      throw new Error('Fighter not found');
    }

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
    if (params.fighter_type_id !== undefined) updateData.fighter_type_id = params.fighter_type_id;
    if (params.fighter_sub_type_id !== undefined) updateData.fighter_sub_type_id = params.fighter_sub_type_id;
    if (params.note !== undefined) updateData.note = params.note;

    // Update fighter
    const { data: updatedFighter, error: updateError } = await supabase
      .from('fighters')
      .update(updateData)
      .eq('id', params.fighter_id)
      .select('id, fighter_name, label, kills, cost_adjustment')
      .single();

    if (updateError) throw updateError;

    // Invalidate cache
    invalidateFighterData(params.fighter_id, fighter.gang_id);
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