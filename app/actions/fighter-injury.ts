'use server';

import { createClient } from '@/utils/supabase/server';
import { invalidateFighterData, invalidateGangRating } from '@/utils/cache-tags';
import { logFighterInjury, logFighterRecovery } from './logs/gang-fighter-logs';
import { getAuthenticatedUser } from '@/utils/auth';

// Helper function to check if user is admin
async function checkAdmin(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', userId)
      .single();
    return profile?.user_role === 'admin';
  } catch {
    return false;
  }
}

export interface AddFighterInjuryParams {
  fighter_id: string;
  injury_type_id: string;
  send_to_recovery?: boolean;
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
}

export async function addFighterInjury(
  params: AddFighterInjuryParams
): Promise<InjuryResult> {
  try {
    const supabase = await createClient();
    
    // Check authentication with optimized getClaims()
    const user = await getAuthenticatedUser(supabase);

    // Check if user is an admin
    const isAdmin = await checkAdmin(supabase, user.id);

    // Verify fighter ownership
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, user_id, gang_id, fighter_name')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      return { success: false, error: 'Fighter not found' };
    }

    // Check permissions - if not admin, must be fighter owner
    if (!isAdmin) {
      const { data: gang, error: gangError } = await supabase
        .from('gangs')
        .select('user_id')
        .eq('id', fighter.gang_id)
        .single();

      if (gangError || !gang || gang.user_id !== user.id) {
        return { success: false, error: 'Access denied' };
      }
    }

    // Add the injury using the RPC function
    const { data, error } = await supabase
      .rpc('add_fighter_injury', {
        in_fighter_id: params.fighter_id,
        in_injury_type_id: params.injury_type_id,
        in_user_id: user.id
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

    // Update rating based on injury credits_increase (if any)
    try {
      const delta = (injuryData?.type_specific_data?.credits_increase || 0) as number;
      if (delta) {
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
      }
    } catch (e) {
      console.error('Failed to update rating for injury addition:', e);
    }
    
    // If recovery is requested, update the fighter's recovery status
    let recoveryStatus = undefined;
    if (params.send_to_recovery) {
      const { error: recoveryError } = await supabase
        .from('fighters')
        .update({ recovery: true })
        .eq('id', params.fighter_id);

      if (recoveryError) {
        console.error('Error setting recovery status:', recoveryError);
        // Don't fail the entire operation, just log the error
      } else {
        recoveryStatus = true;
      }
    }

    if (fighter.fighter_name) {
      await logFighterInjury({
        gang_id: fighter.gang_id,
        fighter_id: params.fighter_id,
        fighter_name: fighter.fighter_name,
        injury_name: injuryData.effect_name
      });
    }

    // Invalidate fighter cache
    invalidateFighterData(params.fighter_id, fighter.gang_id);

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
      recovery_status: recoveryStatus
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
    const isAdmin = await checkAdmin(supabase, user.id);

    // Verify fighter ownership
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, user_id, gang_id, fighter_name')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      return { success: false, error: 'Fighter not found' };
    }

    // Check permissions - if not admin, must be fighter owner
    if (!isAdmin) {
      const { data: gang, error: gangError } = await supabase
        .from('gangs')
        .select('user_id')
        .eq('id', fighter.gang_id)
        .single();

      if (gangError || !gang || gang.user_id !== user.id) {
        return { success: false, error: 'Access denied' };
      }
    }

    const { data: injury, error: injuryError } = await supabase
      .from('fighter_effects')
      .select('id, fighter_id, effect_name, type_specific_data')
      .eq('id', params.injury_id)
      .single();

    if (injuryError || !injury || injury.fighter_id !== params.fighter_id) {
      return { success: false, error: 'Injury not found or does not belong to this fighter' };
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

    // Decrease rating by injury credits_increase if present
    try {
      const delta = -(injury?.type_specific_data?.credits_increase || 0) as number;
      if (delta) {
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
      }
    } catch (e) {
      console.error('Failed to update rating after injury delete:', e);
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
    }

    // Invalidate fighter cache
    invalidateFighterData(params.fighter_id, fighter.gang_id);

    return { success: true };

  } catch (error) {
    console.error('Error deleting fighter injury:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
} 