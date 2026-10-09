'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { hasPostCycleActions } from '@/types/edition';
import { getEditionIdBySlug } from '@/utils/editions';
import { getGangCore, getGangFightersList } from '@/app/lib/shared/gang-data';
import { invalidateFighter } from '@/utils/cache-tags';
import { updateGangFinancials } from '@/utils/gang-rating-and-wealth';
import { addFighterInjury, deleteFighterInjury } from './fighter-injury';
import { editFighterStatus, updateFighterXp } from './edit-fighter';
import { logPostCycleAction } from './logs/gang-post-cycle-logs';
import {
  FIT_BIONICS_COST_PER_INJURY,
  MEDICAL_ESCORT_COST,
  TRAIN_XP,
  assignmentCreditsDelta,
  criticalInjuriesOf,
  patientOf,
  postCycleAvailability,
  validatePostCycleAssignment,
  type PostCycleAssignment,
} from '@/utils/postCycleActions';
import {
  medicalEscortStabilisedRoll,
  resolveInjuryFor,
  resolveMedicalEscort,
  rollD6,
} from '@/utils/dice';

export interface ResolvePostCycleActionParams {
  gangId: string;
  assignment: PostCycleAssignment;
}

/** What changed on one fighter; the gang page keeps fighters in state and patches them. */
export interface PostCycleFighterChange {
  fighterId: string;
  removedEffectIds?: string[];
  addedInjury?: {
    id: string;
    effect_name: string;
    fighter_effect_type_id?: string;
    fighter_effect_modifiers: any[];
    type_specific_data: any;
    created_at: string;
  };
  killed?: boolean;
  recovery?: boolean;
  xpDelta?: number;
}

export interface PostCycleActionOutcome {
  fighterId: string;
  fighterName: string;
  action: PostCycleAssignment['action'];
  /** What happened beyond the action's name, ending on the credits it moved. */
  outcome: string;
  roll?: { total: number; dice: number[] };
  /** What actually moved, so a failed or partial action is not billed in full. */
  creditsDelta: number;
  changes?: PostCycleFighterChange[];
  failed?: boolean;
}

export interface ResolvePostCycleActionResult {
  success: boolean;
  error?: string;
  outcome?: PostCycleActionOutcome;
  /**
   * Something was applied, so the action is spent and logged even if `success`
   * is false: a Fit Bionics that removed two of three injuries, say.
   */
  landed?: boolean;
  gang?: { credits: number; rating: number; wealth: number };
}

/** A handler reports only what happened; the caller adds who and which action. */
type HandlerOutcome = Omit<PostCycleActionOutcome, 'fighterId' | 'fighterName' | 'action'>;

/** A fighter as getGangFightersList returns it, which is all the handlers read. */
type Fighter = Awaited<ReturnType<typeof getGangFightersList>>[number];

interface HandlerContext {
  supabase: any;
  editionSlug: string;
  editionId: string | null;
  performer: Fighter;
  /** Present for the two actions that act on someone else. */
  target?: Fighter;
}

const INJURY_CATEGORY = 'injuries';

/** Injury names repeat across editions, hence the edition id. */
async function findInjuryTypeId(
  supabase: any,
  effectName: string,
  editionId: string | null
): Promise<string | null> {
  const { data } = await supabase
    .from('fighter_effect_types')
    .select('id, fighter_effect_category:fighter_effect_category_id ( category_name )')
    .eq('effect_name', effectName)
    .eq('edition_id', editionId)
    .limit(10);

  const match = (data || []).find(
    (row: any) => row.fighter_effect_category?.category_name === INJURY_CATEGORY
  );
  return match?.id ?? null;
}

// =============================================================================
// Handlers — one per action, each resolving only its own fighter
// =============================================================================

/**
 * The D6 at the Doc. Complications kills the patient, Stabilised swaps the
 * Critical Injury for a 51-56 Lasting Injury, Full Recovery just clears it.
 */
async function handleMedicalEscort(ctx: HandlerContext): Promise<HandlerOutcome> {
  const { supabase, editionSlug, editionId } = ctx;
  const target = ctx.target!;
  const criticalInjury = criticalInjuriesOf(target)[0];
  const escortCost = -MEDICAL_ESCORT_COST;

  const total = rollD6();
  const escortResult = resolveMedicalEscort(total)!;
  const roll = { total, dice: [total] };

  if (escortResult === 'Complications') {
    // Validation only lets a living fighter be the patient, so this toggle kills.
    const killed = await editFighterStatus({ fighter_id: target.id, action: 'kill' });

    return {
      roll,
      outcome: killed.success
        ? `Complications: ${target.fighter_name} died on the table.`
        : `Complications rolled, but applying the death failed: ${killed.error}`,
      creditsDelta: killed.success ? escortCost : 0,
      // Killing also clears Recovery on the server.
      changes: killed.success ? [{ fighterId: target.id, killed: true, recovery: false }] : undefined,
      failed: !killed.success,
    };
  }

  // Find the Stabilised injury before deleting anything, so a failed lookup
  // leaves the patient as they were instead of healed for free.
  const stabilised = escortResult === 'Stabilised' ? medicalEscortStabilisedRoll() : null;
  const injuryName = stabilised ? resolveInjuryFor(stabilised.total, editionSlug)!.name : '';
  const injuryTypeId = stabilised ? await findInjuryTypeId(supabase, injuryName, editionId) : null;

  if (stabilised && !injuryTypeId) {
    return {
      roll: stabilised,
      outcome: `Stabilised, but the Lasting Injury "${injuryName}" could not be found. Nothing was changed or charged.`,
      creditsDelta: 0,
      failed: true,
    };
  }

  if (criticalInjury) {
    const removed = await deleteFighterInjury({
      fighter_id: target.id,
      injury_id: criticalInjury.id,
    });
    if (!removed.success) {
      return {
        roll,
        outcome: `Failed to clear the Critical Injury: ${removed.error}`,
        creditsDelta: 0,
        failed: true,
      };
    }
  }

  const removedEffectIds = criticalInjury ? [criticalInjury.id] : [];

  if (escortResult === 'Full Recovery') {
    // 'recover' toggles, so only a fighter not already in Recovery is sent.
    const recovered = target.recovery
      ? null
      : await editFighterStatus({ fighter_id: target.id, action: 'recover' });

    if (recovered && !recovered.success) {
      return {
        roll,
        outcome:
          `Full Recovery rolled and the Critical Injury was cleared, but sending ` +
          `${target.fighter_name} into Recovery failed: ${recovered.error}`,
        creditsDelta: escortCost,
        changes: [{ fighterId: target.id, removedEffectIds }],
        failed: true,
      };
    }

    return {
      roll,
      outcome: `Full Recovery: ${target.fighter_name} goes into Recovery with no lasting effects.`,
      creditsDelta: escortCost,
      changes: [{ fighterId: target.id, removedEffectIds, recovery: true }],
    };
  }

  // Stabilised: the Critical Injury becomes a 51-56 Lasting Injury.
  const applied = await addFighterInjury({
    fighter_id: target.id,
    injury_type_id: injuryTypeId!,
    send_to_recovery: true,
  });

  return {
    roll: stabilised!,
    outcome: applied.success
      ? `Stabilised: ${target.fighter_name} suffers ${injuryName}.`
      : `Stabilised, but applying ${injuryName} failed: ${applied.error}`,
    // The Critical Injury is gone either way, so the visit is billed.
    creditsDelta: escortCost,
    changes: [
      {
        fighterId: target.id,
        removedEffectIds,
        addedInjury: applied.injury,
        recovery: applied.success ? applied.recovery_status ?? true : undefined,
      },
    ],
    failed: !applied.success,
  };
}

/** Removes the chosen Lasting Injuries, billing only for the ones that went. */
async function handleFitBionics(
  ctx: HandlerContext,
  injuryIds: string[]
): Promise<HandlerOutcome> {
  const target = ctx.target!;
  const removedNames: string[] = [];
  const removedIds: string[] = [];
  let failure: string | undefined;

  for (const injuryId of injuryIds) {
    const injury = (target.effects?.injuries ?? []).find((e) => e.id === injuryId);
    const removed = await deleteFighterInjury({
      fighter_id: target.id,
      injury_id: injuryId,
    });
    if (!removed.success) {
      failure = removed.error;
      break;
    }
    removedIds.push(injuryId);
    removedNames.push(injury?.effect_name ?? 'a Lasting Injury');
  }

  return {
    outcome: failure
      ? `Removed ${removedNames.length} of ${injuryIds.length} Lasting Injuries from ${target.fighter_name} before failing: ${failure}`
      : `Removed ${removedNames.join(', ')} from ${target.fighter_name}.`,
    creditsDelta: -(removedIds.length * FIT_BIONICS_COST_PER_INJURY),
    changes:
      removedIds.length > 0
        ? [{ fighterId: target.id, removedEffectIds: removedIds }]
        : undefined,
    failed: Boolean(failure),
  };
}

async function handleTrain(ctx: HandlerContext): Promise<HandlerOutcome> {
  const trained = await updateFighterXp({
    fighter_id: ctx.performer.id,
    xp_to_add: TRAIN_XP,
  });

  return {
    outcome: trained.success
      ? `Gained ${TRAIN_XP} XP.`
      : `Failed to award XP: ${trained.error}`,
    creditsDelta: 0,
    changes: trained.success
      ? [{ fighterId: ctx.performer.id, xpDelta: TRAIN_XP }]
      : undefined,
    failed: !trained.success,
  };
}

async function runHandler(
  ctx: HandlerContext,
  assignment: PostCycleAssignment
): Promise<HandlerOutcome> {
  switch (assignment.action) {
    case 'medical_escort':
      return handleMedicalEscort(ctx);
    case 'fit_bionics':
      return handleFitBionics(ctx, assignment.injuryIds);
    case 'train':
      return handleTrain(ctx);
    // The rest move their flat credits, if any, and leave a log line; anything
    // else they do is applied elsewhere on the page or by hand.
    default:
      return { outcome: '', creditsDelta: assignmentCreditsDelta(assignment) };
  }
}

// =============================================================================
// Entry point
// =============================================================================

/**
 * Resolve one fighter's Post-cycle Action.
 *
 * One action per call rather than a whole sequence: once an action lands, the
 * saved rows carry the consequence — the patient's Critical Injury is gone, the
 * cards are owned — so the next action is validated against real state instead
 * of against the other rows of a plan. The two cross-fighter rules a single
 * call cannot see (one action per fighter, and the per-action caps such as five
 * Work Territories) are held by the panel.
 *
 * Not atomic within an action: Fit Bionics removing three injuries makes three
 * calls, and a failure partway leaves the earlier ones removed. The outcome
 * reports what landed and bills only that.
 */
export async function resolvePostCycleAction(
  params: ResolvePostCycleActionParams
): Promise<ResolvePostCycleActionResult> {
  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);
    const { assignment, gangId } = params;

    const gang = await getGangCore(gangId, supabase);
    if (!gang) return { success: false, error: 'Gang not found' };

    const editionSlug = gang.edition_slug;
    if (!editionSlug || !hasPostCycleActions(editionSlug)) {
      return {
        success: false,
        error: 'Post-cycle Actions are only available for Necromunda (2026) gangs',
      };
    }

    const [fighters, editionId] = await Promise.all([
      getGangFightersList(gangId, supabase, { gangEditionSlug: editionSlug }),
      getEditionIdBySlug(editionSlug),
    ]);

    const issues = validatePostCycleAssignment(fighters, assignment, {
      ...postCycleAvailability({
        editionSlug,
        gangType: gang.gang_type,
        isCustomGangType: Boolean(gang.custom_gang_type_id),
        subtypeNames: [],
      }),
      // Chaos Corrupted is a gang subtype, and the gang row holds subtype ids,
      // not names. The page decides this from the names it already loads, and
      // both ritual actions are logged only.
      chaosRitualsAvailable: true,
    });
    if (issues.length > 0) {
      return { success: false, error: issues.join(' ') };
    }

    const byId = new Map(fighters.map((f) => [f.id, f]));
    const performer = byId.get(assignment.fighterId)!;
    const patientId = patientOf(assignment);
    const target = patientId ? byId.get(patientId) : undefined;

    // A spend is taken before anything is applied, so a gang that can no longer
    // pay is turned away with nothing changed.
    const charged = Math.min(assignmentCreditsDelta(assignment), 0);
    if (charged < 0) {
      const charge = await updateGangFinancials(supabase, { gangId, creditsDelta: charged });
      if (!charge.success) {
        const error =
          charge.error === 'Insufficient credits'
            ? 'Not enough credits'
            : charge.error || 'Failed to charge the gang';
        return { success: false, error };
      }
    }

    let handled: HandlerOutcome;
    try {
      handled = await runHandler(
        { supabase, editionSlug, editionId, performer, target },
        assignment
      );
    } catch (error) {
      // Settled below like any other failure, so the charge is refunded.
      handled = {
        outcome: error instanceof Error ? error.message : 'The action failed',
        creditsDelta: 0,
        failed: true,
      };
    }

    const outcome: PostCycleActionOutcome = {
      ...handled,
      fighterId: performer.id,
      fighterName: performer.fighter_name,
      action: assignment.action,
    };

    const landed =
      !outcome.failed || outcome.creditsDelta !== 0 || (outcome.changes?.length ?? 0) > 0;

    // Settle against what actually happened: refund what a failed or partial
    // action did not use, and pay out income. Called even at zero, since it also
    // returns the rating and wealth the helpers above moved.
    const financials = await updateGangFinancials(supabase, {
      gangId,
      creditsDelta: outcome.creditsDelta - charged,
    });

    // What landed is still logged, so a failed settle leaves a record to fix by hand.
    const creditsLine = !financials.success
      ? `Updating the gang's credits failed: ${financials.error}.`
      : outcome.creditsDelta > 0
        ? `Gained ${outcome.creditsDelta} credits.`
        : outcome.creditsDelta < 0
          ? `Cost ${-outcome.creditsDelta} credits.`
          : '';
    outcome.outcome = [outcome.outcome, creditsLine].filter(Boolean).join(' ');
    if (!financials.success) outcome.failed = true;

    if (landed) {
      try {
        await logPostCycleAction({
          gang_id: gangId,
          fighter_id: outcome.fighterId,
          fighter_name: outcome.fighterName,
          action: outcome.action,
          outcome: outcome.outcome,
          roll_total: outcome.roll?.total,
          roll_dice: outcome.roll?.dice,
          user_id: user.id,
        });
      } catch (logError) {
        console.error('Failed to log Post-cycle Action:', logError);
      }
    }

    // updateGangFinancials already busted the gang's financial tags.
    invalidateFighter(performer.id, gangId);
    if (target) invalidateFighter(target.id, gangId);

    return {
      success: !outcome.failed,
      error: outcome.failed ? outcome.outcome : undefined,
      outcome,
      landed,
      gang: financials.newValues,
    };
  } catch (error) {
    console.error('Error resolving Post-cycle Action:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resolve the action',
    };
  }
}
