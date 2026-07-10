'use server'

import { TAGS, invalidateGang } from '@/utils/cache-tags';
import { createClient } from "@/utils/supabase/server";
import { getAuthenticatedUser } from '@/utils/auth';
import { checkPermissionCached } from '@/utils/user-permissions';
import { revalidateTag } from 'next/cache';

// Types
export interface SkillAccessOverride {
  skill_type_id: string;
  access_level: 'primary' | 'secondary' | 'allowed' | 'denied';
}

interface SaveFighterSkillAccessResult {
  success: boolean;
  error?: string;
}

/**
 * Save skill access overrides for a fighter
 */
export async function saveFighterSkillAccessOverrides(params: {
  fighter_id: string;
  overrides: SkillAccessOverride[];
}): Promise<SaveFighterSkillAccessResult> {
  try {
    const supabase = await createClient();
    
    // Authenticate user
    const user = await getAuthenticatedUser(supabase);
    if (!user) {
      return { success: false, error: 'Unauthorized' };
    }

    // Get fighter info to verify permissions
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, gang_id, gangs:gang_id(user_id)')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      return { success: false, error: 'Fighter not found' };
    }

    const gangOwnerId = (fighter.gangs as any)?.user_id ?? null;
    const permissions = await checkPermissionCached(user.id, fighter.gang_id, gangOwnerId);
    if (!permissions.canEdit) {
      return { success: false, error: 'Access denied' };
    }

    // Delete existing overrides for this fighter
    const { error: deleteError } = await supabase
      .from('fighter_skill_access_override')
      .delete()
      .eq('fighter_id', params.fighter_id);

    if (deleteError) {
      return { success: false, error: 'Failed to clear existing overrides' };
    }

    // Insert new overrides (only if there are any)
    if (params.overrides.length > 0) {
      const overrideRows = params.overrides.map(override => ({
        fighter_id: params.fighter_id,
        skill_type_id: override.skill_type_id,
        access_level: override.access_level,
        user_id: user.id
      }));

      const { error: insertError } = await supabase
        .from('fighter_skill_access_override')
        .insert(overrideRows);

      if (insertError) {
        console.error('Error inserting overrides:', insertError);
        return { success: false, error: 'Failed to save skill access overrides' };
      }
    }

    // Invalidate relevant caches
    revalidateTag(TAGS.fighter(params.fighter_id), { expire: 0 });
    invalidateGang(fighter.gang_id);

    return { success: true };
  } catch (error) {
    console.error('Error in saveFighterSkillAccessOverrides:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    };
  }
}
