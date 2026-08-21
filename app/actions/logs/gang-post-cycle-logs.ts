'use server'

import { createGangLog, GangLogActionResult } from "./gang-logs";
import { formatRollOutcomeLine } from "@/utils/dice";
import { POST_CYCLE_ACTIONS, type PostCycleActionId } from "@/utils/postCycleActions";

/**
 * One `action_type` per Post-cycle Action rather than a single shared one, so
 * the log modal's Action Type filter can single out "every Medical Escort this
 * gang has run" — the same granularity equipment and vehicle damage already
 * log at.
 *
 * Typed `Record<PostCycleActionId, string>`, so adding an action to the catalog
 * is a compile error here until it states its log type. Every value below also
 * needs a label in LOG_TYPE_LABELS (utils/log-types.ts), or the UI falls back to
 * showing the raw snake_case string.
 */
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
  /** The fighter that spent the action. */
  fighter_id: string;
  fighter_name: string;
  action: PostCycleActionId;
  /** The fighter acted upon, for Medical Escort and Fit Bionics. */
  target_fighter_name?: string;
  /**
   * What actually happened — the roll outcome, the injuries removed, the XP
   * gained. One sentence, already phrased for a reader.
   */
  outcome?: string;
  /** The D6 (or D66) behind the outcome, rendered as `Roll 5 (5): …`. */
  roll_total?: number;
  roll_dice?: number[];
  roll_label?: string;
  /** Net credits for this action alone: negative spent, positive earned. */
  credits_delta?: number;
  user_id?: string;
}

/**
 * One entry per fighter that acted, typed by which action they took.
 *
 * The helpers this composes with (deleteFighterInjury, updateFighterXp,
 * repairVehicleDamage) each write their own granular log too, so this line
 * deliberately records the *decision* — who spent their action on what — rather
 * than restating every row that changed.
 */
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
