'use server'

import { createGangLog, GangLogActionResult } from "./gang-logs";
import { formatRollOutcomeLine } from "@/utils/dice";
import { POST_CYCLE_ACTIONS, type PostCycleActionId } from "@/utils/postCycleActions";

/** One type per action so the log can be filtered by it; each needs a LOG_TYPE_LABELS entry. */
const POST_CYCLE_LOG_ACTION_TYPES: Record<PostCycleActionId, string> = {
  medical_escort: 'post_cycle_medical_escort',
  fit_bionics: 'post_cycle_fit_bionics',
  develop_tactics: 'post_cycle_develop_tactics',
  visit_chop_shop: 'post_cycle_chop_shop',
  work_territory: 'post_cycle_work_territory',
  visit_trading_post: 'post_cycle_trading_post',
  train: 'post_cycle_train',
};

export interface PostCycleActionLogParams {
  gang_id: string;
  fighter_id: string;
  fighter_name: string;
  action: PostCycleActionId;
  target_fighter_name?: string;
  outcome?: string;
  roll_total?: number;
  roll_dice?: number[];
  roll_label?: string;
  credits_delta?: number;
  user_id?: string;
}

/** Records who spent their action on what; the helpers log the row changes themselves. */
export async function logPostCycleAction(
  params: PostCycleActionLogParams
): Promise<GangLogActionResult> {
  const definition = POST_CYCLE_ACTIONS[params.action];

  const parts: string[] = [
    `Fighter "${params.fighter_name}" performed the ${definition.label} Post-cycle Action`,
  ];

  if (params.target_fighter_name) {
    parts.push(` targeting "${params.target_fighter_name}"`);
  }
  parts.push('.');

  if (params.roll_total !== undefined) {
    parts.push(
      ` ${formatRollOutcomeLine(
        params.roll_total,
        params.roll_dice ?? [params.roll_total],
        params.roll_label
      )}.`
    );
  }

  if (params.outcome) {
    parts.push(` ${params.outcome}`);
  }

  if (params.credits_delta) {
    parts.push(
      params.credits_delta > 0
        ? ` Gained ${params.credits_delta} credits.`
        : ` Cost ${Math.abs(params.credits_delta)} credits.`
    );
  }

  return createGangLog({
    gang_id: params.gang_id,
    fighter_id: params.fighter_id,
    action_type: POST_CYCLE_LOG_ACTION_TYPES[params.action],
    description: parts.join(''),
    user_id: params.user_id,
  });
}
