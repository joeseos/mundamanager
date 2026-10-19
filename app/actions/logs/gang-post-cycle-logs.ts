'use server'

import { createGangLog, GangLogActionResult } from "./gang-logs";
import { formatRollOutcomeLine, type RollOutcome } from "@/utils/dice";
import {
  POST_CYCLE_LOG_TYPE_LABELS,
  postCycleLogType,
  type PostCycleLogStep,
} from "@/utils/postCycleActions";

export interface PostCycleActionLogParams {
  gang_id: string;
  /** Absent for Collect Income, which the gang takes rather than a fighter. */
  fighter_id?: string;
  fighter_name?: string;
  action: PostCycleLogStep;
  outcome?: string;
  roll?: RollOutcome;
  user_id?: string;
}

/** Records who spent their action on what; the helpers log the row changes themselves. */
export async function logPostCycleAction(
  params: PostCycleActionLogParams
): Promise<GangLogActionResult> {
  const actionType = postCycleLogType(params.action);
  const description = [
    params.fighter_name &&
      `Fighter "${params.fighter_name}" performed the ${POST_CYCLE_LOG_TYPE_LABELS[actionType]} Post-cycle Action.`,
    params.roll && `${formatRollOutcomeLine(params.roll.total, params.roll.dice)}.`,
    params.outcome,
  ].filter(Boolean).join(' ');

  return createGangLog({
    gang_id: params.gang_id,
    fighter_id: params.fighter_id,
    action_type: actionType,
    description,
    user_id: params.user_id,
  });
}
