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
  const firstLine = `Gang rolled ${params.total} on the Gang Tactics table, resulting in: "${params.card_name}"`;

  return createGangLog({
    gang_id: params.gang_id,
    action_type: 'tactics_card_roll',
    description: `${firstLine}\n${formatRollOutcomeLine(params.total, params.dice)}`
  });
}

export async function logTacticsCardAdded(params: TacticsCardLogParams): Promise<GangLogActionResult> {
  return createGangLog({
    gang_id: params.gang_id,
    action_type: 'tactics_card_added',
    description: `Added Gang Tactic "${params.card_name}".`
  });
}

export async function logTacticsCardRemoved(params: TacticsCardLogParams): Promise<GangLogActionResult> {
  return createGangLog({
    gang_id: params.gang_id,
    action_type: 'tactics_card_removed',
    description: `Removed Gang Tactic "${params.card_name}".`
  });
}
