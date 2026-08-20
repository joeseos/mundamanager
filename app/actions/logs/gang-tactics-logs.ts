'use server'

import { createGangLog, GangLogActionResult } from "./gang-logs";
import { formatRollOutcomeLine } from "@/utils/dice";

interface TacticsCardRollLogParams {
  gang_id: string;
  card_name: string;
  total: number;
  dice: number[];
}

interface TacticsCardLogParams {
  gang_id: string;
  card_name: string;
}

export async function logRolledTacticsCard(params: TacticsCardRollLogParams): Promise<GangLogActionResult> {
  try {
    const firstLine = `Gang rolled ${params.total} on the Gang Tactics table, resulting in: "${params.card_name}"`;
    const description = `${firstLine}\n${formatRollOutcomeLine(params.total, params.dice)}`;

    return await createGangLog({
      gang_id: params.gang_id,
      action_type: 'tactics_card_roll',
      description
    });
  } catch (error) {
    console.error('Error logging the Gang Tactics roll:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to log the Gang Tactics roll'
    };
  }
}

export async function logTacticsCardAdded(params: TacticsCardLogParams): Promise<GangLogActionResult> {
  try {
    return await createGangLog({
      gang_id: params.gang_id,
      action_type: 'tactics_card_added',
      description: `Added Gang Tactic "${params.card_name}".`
    });
  } catch (error) {
    console.error('Error logging the added Gang Tactic:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to log the added Gang Tactic'
    };
  }
}

export async function logTacticsCardRemoved(params: TacticsCardLogParams): Promise<GangLogActionResult> {
  try {
    return await createGangLog({
      gang_id: params.gang_id,
      action_type: 'tactics_card_removed',
      description: `Removed Gang Tactic "${params.card_name}".`
    });
  } catch (error) {
    console.error('Error logging the removed Gang Tactic:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to log the removed Gang Tactic'
    };
  }
}
