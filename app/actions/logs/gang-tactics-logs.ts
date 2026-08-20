'use server'

import { createGangLog, GangLogActionResult } from "./gang-logs";
import { formatRollOutcomeLine } from "@/utils/dice";

export async function logRolledTacticsCard(params: {
  gang_id: string;
  card_name: string;
  total: number;
  dice: number[];
}): Promise<GangLogActionResult> {
  return createGangLog({
    gang_id: params.gang_id,
    action_type: 'tactics_card_roll',
    description: formatRollOutcomeLine(params.total, params.dice, params.card_name)
  });
}

export async function logTacticsCardAdded(params: {
  gang_id: string;
  card_name: string;
}): Promise<GangLogActionResult> {
  return createGangLog({
    gang_id: params.gang_id,
    action_type: 'tactics_card_added',
    description: `Added Gang Tactic "${params.card_name}"`
  });
}

export async function logTacticsCardRemoved(params: {
  gang_id: string;
  card_name: string;
}): Promise<GangLogActionResult> {
  return createGangLog({
    gang_id: params.gang_id,
    action_type: 'tactics_card_removed',
    description: `Removed Gang Tactic "${params.card_name}"`
  });
}
