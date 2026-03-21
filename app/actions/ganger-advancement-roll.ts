'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { logRolledGangerAdvancement } from '@/app/actions/logs/gang-fighter-logs';
import type { GangLogActionResult } from '@/app/actions/logs/gang-logs';

export interface VerifyAndLogRolledGangerAdvancementRollParams {
  fighter_id: string;
  advancement_table: string;
  outcome_label: string;
  dice_data: Record<string, unknown>;
}

const ELIGIBLE_CLASSES = new Set(['Ganger', 'Exotic Beast']);

export async function verifyAndLogRolledGangerAdvancementRoll(
  params: VerifyAndLogRolledGangerAdvancementRollParams
): Promise<GangLogActionResult> {
  try {
    const supabase = await createClient();
    await getAuthenticatedUser(supabase);

    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('id, gang_id, fighter_name, fighter_class')
      .eq('id', params.fighter_id)
      .single();

    if (fighterError || !fighter) {
      throw new Error('Fighter not found');
    }

    if (!fighter.fighter_class || !ELIGIBLE_CLASSES.has(fighter.fighter_class)) {
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
