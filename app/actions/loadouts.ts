'use server'

import { createClient } from "@/utils/supabase/server";
import { getAuthenticatedUser } from '@/utils/auth';
import { invalidateFighterLoadouts } from '@/utils/cache-tags';

// =============================================================================
// TYPES
// =============================================================================

interface CreateLoadoutParams {
  fighter_id: string;
  gang_id: string;
  loadout_name: string;
  equipment_ids?: string[];  // fighter_equipment_ids to include
}

interface UpdateLoadoutParams {
  loadout_id: string;
  fighter_id: string;
  gang_id: string;
  loadout_name?: string;
  equipment_ids?: string[];  // Full replacement of equipment list
}

interface DeleteLoadoutParams {
  loadout_id: string;
  fighter_id: string;
  gang_id: string;
}

interface SetActiveLoadoutParams {
  loadout_id: string | null;  // null to deactivate (show all equipment)
  fighter_id: string;
  gang_id: string;
}

interface LoadoutActionResult {
  success: boolean;
  data?: any;
  error?: string;
}

// =============================================================================
// SERVER ACTIONS
// =============================================================================

/**
 * Create a new loadout for a fighter
 */
export async function createLoadout(params: CreateLoadoutParams): Promise<LoadoutActionResult> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Insert the loadout
    const { data: loadout, error: loadoutError } = await supabase
      .from('fighter_loadouts')
      .insert({
        fighter_id: params.fighter_id,
        loadout_name: params.loadout_name,
        user_id: user.id
      })
      .select('id, loadout_name')
      .single();

    if (loadoutError) {
      if (loadoutError.code === '23505') {
        return { success: false, error: 'A loadout with this name already exists' };
      }
      throw loadoutError;
    }

    // If equipment_ids provided, insert junction records
    if (params.equipment_ids && params.equipment_ids.length > 0) {
      const junctionRecords = params.equipment_ids.map(equipmentId => ({
        loadout_id: loadout.id,
        fighter_equipment_id: equipmentId
      }));

      const { error: junctionError } = await supabase
        .from('fighter_loadout_equipment')
        .insert(junctionRecords);

      if (junctionError) {
        // Rollback: delete the loadout
        await supabase.from('fighter_loadouts').delete().eq('id', loadout.id);
        throw junctionError;
      }
    }

    // Invalidate caches
    invalidateFighterLoadouts({
      fighterId: params.fighter_id,
      gangId: params.gang_id
    });

    return {
      success: true,
      data: {
        loadout_id: loadout.id,
        loadout_name: loadout.loadout_name,
        equipment_ids: params.equipment_ids || []
      }
    };
  } catch (error) {
    console.error('Error creating loadout:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create loadout'
    };
  }
}

/**
 * Update an existing loadout (name and/or equipment)
 */
export async function updateLoadout(params: UpdateLoadoutParams): Promise<LoadoutActionResult> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Update loadout name if provided
    if (params.loadout_name !== undefined) {
      const { error: updateError } = await supabase
        .from('fighter_loadouts')
        .update({ loadout_name: params.loadout_name })
        .eq('id', params.loadout_id);

      if (updateError) {
        if (updateError.code === '23505') {
          return { success: false, error: 'A loadout with this name already exists' };
        }
        throw updateError;
      }
    }

    // Update equipment list if provided
    if (params.equipment_ids !== undefined) {
      // Delete existing junction records
      const { error: deleteError } = await supabase
        .from('fighter_loadout_equipment')
        .delete()
        .eq('loadout_id', params.loadout_id);

      if (deleteError) {
        throw deleteError;
      }

      // Insert new junction records
      if (params.equipment_ids.length > 0) {
        const junctionRecords = params.equipment_ids.map(equipmentId => ({
          loadout_id: params.loadout_id,
          fighter_equipment_id: equipmentId
        }));

        const { error: insertError } = await supabase
          .from('fighter_loadout_equipment')
          .insert(junctionRecords);

        if (insertError) {
          throw insertError;
        }
      }
    }

    // Invalidate caches
    invalidateFighterLoadouts({
      fighterId: params.fighter_id,
      gangId: params.gang_id
    });

    return {
      success: true,
      data: {
        loadout_id: params.loadout_id,
        loadout_name: params.loadout_name,
        equipment_ids: params.equipment_ids
      }
    };
  } catch (error) {
    console.error('Error updating loadout:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update loadout'
    };
  }
}

/**
 * Delete a loadout
 * Note: If this is the active loadout, fighters.active_loadout_id will be set to NULL
 * automatically due to ON DELETE SET NULL
 */
export async function deleteLoadout(params: DeleteLoadoutParams): Promise<LoadoutActionResult> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Delete the loadout (CASCADE will remove junction records)
    const { error: deleteError } = await supabase
      .from('fighter_loadouts')
      .delete()
      .eq('id', params.loadout_id);

    if (deleteError) {
      throw deleteError;
    }

    // Invalidate caches
    invalidateFighterLoadouts({
      fighterId: params.fighter_id,
      gangId: params.gang_id
    });

    return { success: true };
  } catch (error) {
    console.error('Error deleting loadout:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete loadout'
    };
  }
}

/**
 * Set the active loadout for a fighter
 * Pass null to deactivate all loadouts (show all equipment)
 */
export async function setActiveLoadout(params: SetActiveLoadoutParams): Promise<LoadoutActionResult> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Update the fighter's active_loadout_id
    const { error: updateError } = await supabase
      .from('fighters')
      .update({ active_loadout_id: params.loadout_id })
      .eq('id', params.fighter_id);

    if (updateError) {
      throw updateError;
    }

    // Invalidate caches
    invalidateFighterLoadouts({
      fighterId: params.fighter_id,
      gangId: params.gang_id
    });

    return {
      success: true,
      data: {
        active_loadout_id: params.loadout_id
      }
    };
  } catch (error) {
    console.error('Error setting active loadout:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set active loadout'
    };
  }
}
