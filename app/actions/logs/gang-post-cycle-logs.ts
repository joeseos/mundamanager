'use server'

import { createGangLog, GangLogActionResult } from "./gang-logs";
import { formatFinancialChanges } from "./log-helpers";
import { formatRollOutcomeLine } from "@/utils/dice";
import { POST_CYCLE_ACTIONS, type PostCycleActionId } from "@/utils/postCycleActions";

/** Financial snapshot either side of the whole sequence, for the summary line. */
export interface PostCycleFinancials {
  credits: number;
  rating: number;
  wealth: number;
}

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
 * One `post_cycle_action` entry per fighter that acted.
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
    action_type: 'post_cycle_action',
    description: parts.join(''),
    user_id: params.user_id,
  });
}

export interface PostCycleSequenceLogParams {
  gang_id: string;
  /** How many fighters actually spent an action. */
  action_count: number;
  before: PostCycleFinancials;
  after: PostCycleFinancials;
  user_id?: string;
}

/**
 * A single closing entry for the sequence, carrying the financial movement.
 * Per-fighter entries name what each fighter did; this one answers "what did the
 * whole Post-cycle Sequence cost the gang".
 */
export async function logPostCycleSequence(
  params: PostCycleSequenceLogParams
): Promise<GangLogActionResult> {
  const financials = formatFinancialChanges(
    params.before.credits,
    params.after.credits,
    params.before.rating,
    params.after.rating,
    params.before.wealth,
    params.after.wealth
  );

  const summary =
    `Gang resolved a Post-cycle Sequence with ${params.action_count} ` +
    `Post-cycle Action${params.action_count === 1 ? '' : 's'}.`;

  return createGangLog({
    gang_id: params.gang_id,
    action_type: 'post_cycle_sequence',
    description: financials ? `${summary}\n${financials}` : summary,
    user_id: params.user_id,
  });
}
