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
  lead_ritual: 'post_cycle_lead_ritual',
  ritual_focus: 'post_cycle_ritual_focus',
  death_rites: 'post_cycle_death_rites',
  suit_evolution: 'post_cycle_suit_evolution',
  suit_maintenance: 'post_cycle_suit_maintenance',
  terrorise_territory: 'post_cycle_terrorise_territory',
  train: 'post_cycle_train',
};

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
    action_type: POST_CYCLE_LOG_ACTION_TYPES[params.action],
    description: parts.join(''),
    user_id: params.user_id,
  });
}
