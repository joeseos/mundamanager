'use server'

import { createGangLog, GangLogActionResult } from "./gang-logs";
import { formatRollOutcomeLine, type RollOutcome } from "@/utils/dice";
import { POST_CYCLE_ACTIONS, postCycleLogType, type PostCycleActionId } from "@/utils/postCycleActions";

export interface PostCycleActionLogParams {
  gang_id: string;
  fighter_id: string;
  fighter_name: string;
  action: PostCycleActionId;
  outcome?: string;
  roll?: RollOutcome;
  user_id?: string;
}

/** Records who spent their action on what; the helpers log the row changes themselves. */
export async function logPostCycleAction(
  params: PostCycleActionLogParams
): Promise<GangLogActionResult> {
  const description = [
    `Fighter "${params.fighter_name}" performed the ${POST_CYCLE_ACTIONS[params.action].label} Post-cycle Action.`,
    params.roll && `${formatRollOutcomeLine(params.roll.total, params.roll.dice)}.`,
    params.outcome,
  ].filter(Boolean).join(' ');

  return createGangLog({
    gang_id: params.gang_id,
    fighter_id: params.fighter_id,
    action_type: postCycleLogType(params.action),
    description,
    user_id: params.user_id,
  });
}
