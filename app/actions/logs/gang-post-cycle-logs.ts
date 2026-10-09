'use server'

import { createGangLog, GangLogActionResult } from "./gang-logs";
import { formatRollOutcomeLine } from "@/utils/dice";
import { POST_CYCLE_ACTIONS, postCycleLogType, type PostCycleActionId } from "@/utils/postCycleActions";

export interface PostCycleActionLogParams {
  gang_id: string;
  fighter_id: string;
  fighter_name: string;
  action: PostCycleActionId;
  outcome?: string;
  roll_total?: number;
  roll_dice?: number[];
  user_id?: string;
}

/** Records who spent their action on what; the helpers log the row changes themselves. */
export async function logPostCycleAction(
  params: PostCycleActionLogParams
): Promise<GangLogActionResult> {
  const definition = POST_CYCLE_ACTIONS[params.action];

  const parts: string[] = [
    `Fighter "${params.fighter_name}" performed the ${definition.label} Post-cycle Action.`,
  ];

  if (params.roll_total !== undefined) {
    parts.push(
      ` ${formatRollOutcomeLine(params.roll_total, params.roll_dice ?? [params.roll_total])}.`
    );
  }

  if (params.outcome) {
    parts.push(` ${params.outcome}`);
  }

  return createGangLog({
    gang_id: params.gang_id,
    fighter_id: params.fighter_id,
    action_type: postCycleLogType(params.action),
    description: parts.join(''),
    user_id: params.user_id,
  });
}
