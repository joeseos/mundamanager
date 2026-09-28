'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { hasGangTacticsCards, hasPostCycleActions } from '@/types/edition';
import { getEditionIdBySlug } from '@/utils/editions';
import {
  getGangCore,
  getGangFightersList,
  getGangTacticsCards,
} from '@/app/lib/shared/gang-data';
import { invalidateFighter } from '@/utils/cache-tags';
import { updateGangFinancials } from '@/utils/gang-rating-and-wealth';
import { addFighterInjury, deleteFighterInjury } from './fighter-injury';
import { editFighterStatus, updateFighterXp } from './edit-fighter';
import { logPostCycleAction } from './logs/gang-post-cycle-logs';
import { addGangTacticsCards } from './gang-tactics-cards';
import type { GangTacticsCard } from '@/types/tactics-card';
import {
  FIT_BIONICS_COST_PER_INJURY,
  TRAIN_XP,
  WORK_TERRITORY_INCOME,
  assignmentCreditsDelta,
  criticalInjuriesOf,
  postCycleTotalCredits,
  validatePostCycleAssignments,
  type PostCycleAssignment,
} from '@/utils/postCycleActions';
import {
  medicalEscortStabilisedRoll,
  resolveInjuryFor,
  resolveMedicalEscort,
  rollD6,
} from '@/utils/dice';

export interface ApplyPostCycleActionsParams {
  gangId: string;
  assignments: PostCycleAssignment[];
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
  addedTacticsCards?: GangTacticsCard[];
  changes?: PostCycleFighterChange[];
  failed?: boolean;
}

export interface ApplyPostCycleActionsResult {
  success: boolean;
  error?: string;
  results: PostCycleActionOutcome[];
  gang?: { credits: number; rating: number; wealth: number };
}

const INJURY_CATEGORY = 'injuries';

/** Injury names repeat across editions, hence the edition id. */
async function findInjuryTypeId(
  supabase: any,
  effectName: string,
  editionId: string
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

/**
 * Not atomic: each action goes through the existing per-fighter helpers, so a
 * failure partway leaves earlier actions applied. `results` reports what landed.
 */
export async function applyPostCycleActions(
  params: ApplyPostCycleActionsParams
): Promise<ApplyPostCycleActionsResult> {
  const results: PostCycleActionOutcome[] = [];

  try {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);

    const { assignments, gangId } = params;
    if (!assignments?.length) {
      return { success: false, error: 'No Post-cycle Actions selected', results };
    }

    const gang = await getGangCore(gangId, supabase);
    if (!gang) {
      return { success: false, error: 'Gang not found', results };
    }

    const editionSlug = gang.edition_slug;
    if (!editionSlug || !hasPostCycleActions(editionSlug)) {
      return {
        success: false,
        error: 'Post-cycle Actions are only available for Necromunda (2026) gangs',
        results,
      };
    }

    const [fighters, ownedTacticsCards, editionId] = await Promise.all([
      getGangFightersList(gangId, supabase, { gangEditionSlug: editionSlug }),
      getGangTacticsCards(gangId, supabase),
      getEditionIdBySlug(editionSlug),
    ]);
    const byId = new Map(fighters.map((f) => [f.id, f]));

    const issues = validatePostCycleAssignments(fighters, assignments, {
      tacticsCardsAvailable: hasGangTacticsCards(editionSlug),
      ownedTacticsCardIds: new Set(ownedTacticsCards.map((card) => card.tactics_cards_id)),
    });
    if (issues.length > 0) {
      return { success: false, error: issues.map((i) => i.message).join(' '), results };
    }

    const totalCost = -postCycleTotalCredits(assignments);
    const startingCredits = gang.credits ?? 0;

    if (totalCost > 0 && startingCredits < totalCost) {
      return {
        success: false,
        error: `Not enough credits for these Post-cycle Actions. Required: ${totalCost}, Available: ${startingCredits}`,
        results,
      };
    }

    const touchedFighterIds = new Set<string>();

    for (const assignment of assignments) {
      const performer = byId.get(assignment.fighterId)!;
      const target =
        assignment.action === 'medical_escort' || assignment.action === 'fit_bionics'
          ? byId.get(assignment.targetFighterId)!
          : undefined;

      const base = {
        fighterId: performer.id,
        fighterName: performer.fighter_name,
        action: assignment.action,
      };

      touchedFighterIds.add(performer.id);
      if (target) touchedFighterIds.add(target.id);

      switch (assignment.action) {
        case 'medical_escort': {
          const criticalInjury = criticalInjuriesOf(target!)[0];
          const escortCost = assignmentCreditsDelta(assignment);

          // editFighterStatus('kill') toggles, so it must never run on a dead fighter.
          const killTarget = async (): Promise<{ ok: boolean; error?: string }> => {
            if (target!.killed) return { ok: true };
            const killed = await editFighterStatus({
              fighter_id: target!.id,
              action: 'kill',
            });
            if (killed.success) target!.killed = true;
            return { ok: killed.success, error: killed.error };
          };

          if (assignment.declineToPay) {
            const killed = await killTarget();
            results.push({
              ...base,
              outcome: killed.ok
                ? `The gang refused to pay, so ${target!.fighter_name} died.`
                : `Failed to apply the death of ${target!.fighter_name}: ${killed.error}`,
              creditsDelta: 0,
              changes: killed.ok ? [{ fighterId: target!.id, killed: true }] : undefined,
              failed: !killed.ok,
            });
            break;
          }

          const raw = rollD6();
          const total = raw + assignment.goodStuffSteps;
          const escortResult = resolveMedicalEscort(total);
          const roll = { total, dice: [raw] };

          if (!escortResult) {
            results.push({
              ...base,
              roll,
              outcome: `Could not resolve a Medical Escort roll of ${total}.`,
              creditsDelta: 0,
              failed: true,
            });
            break;
          }

          if (escortResult === 'Complications') {
            const killed = await killTarget();
            results.push({
              ...base,
              roll,
              outcome: killed.ok
                ? `Complications: ${target!.fighter_name} died on the table.`
                : `Complications rolled, but applying the death failed: ${killed.error}`,
              creditsDelta: killed.ok ? escortCost : 0,
              changes: killed.ok ? [{ fighterId: target!.id, killed: true }] : undefined,
              failed: !killed.ok,
            });
            break;
          }

          // Find the Stabilised injury before deleting anything, or a missing injury
          // row (N26 'Eye Injury') would leave the fighter healed for free.
          const stabilised =
            escortResult === 'Stabilised' ? medicalEscortStabilisedRoll() : null;
          const injuryEntry = stabilised
            ? resolveInjuryFor(stabilised.total, editionSlug)
            : undefined;
          const injuryTypeId =
            injuryEntry && editionId
              ? await findInjuryTypeId(supabase, injuryEntry.name, editionId)
              : null;

          if (stabilised && !injuryTypeId) {
            results.push({
              ...base,
              roll: stabilised,
              outcome:
                `Stabilised, but the Lasting Injury "${injuryEntry?.name ?? 'unknown'}" ` +
                `is not set up for this edition. Nothing was changed or charged — ` +
                `apply it by hand.`,
              creditsDelta: 0,
              failed: true,
            });
            break;
          }

          if (criticalInjury) {
            const removed = await deleteFighterInjury({
              fighter_id: target!.id,
              injury_id: criticalInjury.id,
            });
            if (!removed.success) {
              results.push({
                ...base,
                roll,
                outcome: `Failed to clear the Critical Injury: ${removed.error}`,
                creditsDelta: 0,
                failed: true,
              });
              break;
            }
          }

          if (escortResult === 'Full Recovery') {
            // 'recover' toggles, so only a fighter not already in Recovery is sent.
            const recovered = target!.recovery
              ? null
              : await editFighterStatus({ fighter_id: target!.id, action: 'recover' });

            if (recovered && !recovered.success) {
              results.push({
                ...base,
                roll,
                outcome:
                  `Full Recovery rolled and the Critical Injury was cleared, but ` +
                  `sending ${target!.fighter_name} into Recovery failed: ${recovered.error}`,
                creditsDelta: escortCost,
                failed: true,
              });
              break;
            }

            results.push({
              ...base,
              roll,
              outcome: `Full Recovery: ${target!.fighter_name} goes into Recovery with no lasting effects.`,
              creditsDelta: escortCost,
              changes: [
                {
                  fighterId: target!.id,
                  removedEffectIds: criticalInjury ? [criticalInjury.id] : [],
                  recovery: true,
                },
              ],
            });
            break;
          }

          const applied = await addFighterInjury({
            fighter_id: target!.id,
            injury_type_id: injuryTypeId!,
            send_to_recovery: true,
          });

          results.push({
            ...base,
            roll: stabilised!,
            outcome: applied.success
              ? `Stabilised: ${target!.fighter_name} suffers ${injuryEntry!.name}.`
              : `Stabilised, but applying ${injuryEntry!.name} failed: ${applied.error}`,
            // The Critical Injury is gone either way, so the visit is billed.
            creditsDelta: escortCost,
            changes: [
              {
                fighterId: target!.id,
                removedEffectIds: criticalInjury ? [criticalInjury.id] : [],
                addedInjury: applied.injury,
                recovery: applied.success ? applied.recovery_status ?? true : undefined,
              },
            ],
            failed: !applied.success,
          });
          break;
        }

        case 'fit_bionics': {
          const removedNames: string[] = [];
          const removedIds: string[] = [];
          let failure: string | undefined;

          for (const injuryId of assignment.injuryIds) {
            const injury = (target!.effects?.injuries ?? []).find(
              (e) => e.id === injuryId
            );
            const removed = await deleteFighterInjury({
              fighter_id: target!.id,
              injury_id: injuryId,
            });
            if (!removed.success) {
              failure = removed.error;
              break;
            }
            removedIds.push(injuryId);
            removedNames.push(injury?.effect_name ?? 'a Lasting Injury');
          }

          results.push({
            ...base,
            outcome: failure
              ? `Removed ${removedNames.length} of ${assignment.injuryIds.length} Lasting Injuries from ${target!.fighter_name} before failing: ${failure}`
              : `Removed ${removedNames.join(', ')} from ${target!.fighter_name}.`,
            creditsDelta: -(removedIds.length * FIT_BIONICS_COST_PER_INJURY),
            changes:
              removedIds.length > 0
                ? [{ fighterId: target!.id, removedEffectIds: removedIds }]
                : undefined,
            failed: Boolean(failure),
          });
          break;
        }

        case 'visit_chop_shop':
        case 'visit_trading_post':
          results.push({ ...base, outcome: '', creditsDelta: 0 });
          break;

        case 'train': {
          const trained = await updateFighterXp({
            fighter_id: performer.id,
            xp_to_add: TRAIN_XP,
          });

          results.push({
            ...base,
            outcome: trained.success
              ? `Gained ${TRAIN_XP} XP.`
              : `Failed to award XP: ${trained.error}`,
            creditsDelta: 0,
            changes: trained.success
              ? [{ fighterId: performer.id, xpDelta: TRAIN_XP }]
              : undefined,
            failed: !trained.success,
          });
          break;
        }

        case 'work_territory':
          results.push({
            ...base,
            outcome: '',
            creditsDelta: WORK_TERRITORY_INCOME,
          });
          break;

        case 'develop_tactics': {
          // Re-validates the ids, logs and busts the tactics cache itself.
          const addedCards = await addGangTacticsCards({
            gangId,
            tacticsCardIds: assignment.tacticsCardIds,
          });

          const names = (addedCards.data ?? []).map((card) => card.name);

          results.push({
            ...base,
            outcome: addedCards.success
              ? `Added ${names.join(', ')}.`
              : `Failed to add the Gang Tactics: ${addedCards.error}`,
            creditsDelta: 0,
            addedTacticsCards: addedCards.data,
            failed: !addedCards.success,
          });
          break;
        }
      }
    }

    for (const result of results) {
      if (result.creditsDelta === 0) continue;
      const credits =
        result.creditsDelta > 0
          ? `Gained ${result.creditsDelta} credits.`
          : `Cost ${-result.creditsDelta} credits.`;
      result.outcome = result.outcome ? `${result.outcome} ${credits}` : credits;
    }

    // Billed from outcomes rather than the plan. Called even at zero, since it
    // also returns the rating and wealth the helpers above moved.
    const financials = await updateGangFinancials(supabase, {
      gangId,
      creditsDelta: results.reduce((sum, result) => sum + result.creditsDelta, 0),
    });

    if (!financials.success) {
      return {
        success: false,
        error: financials.error || 'Failed to update gang credits',
        results,
      };
    }

    for (const result of results) {
      // A failure is still logged if part of it landed, e.g. a partial Fit Bionics.
      const landed =
        !result.failed || result.creditsDelta !== 0 || (result.changes?.length ?? 0) > 0;
      if (!landed) continue;

      try {
        await logPostCycleAction({
          gang_id: gangId,
          fighter_id: result.fighterId,
          fighter_name: result.fighterName,
          action: result.action,
          outcome: result.outcome,
          roll_total: result.roll?.total,
          roll_dice: result.roll?.dice,
          user_id: user.id,
        });
      } catch (logError) {
        console.error('Failed to log Post-cycle Action:', logError);
      }
    }

    // updateGangFinancials already busted the gang's financial tags.
    for (const fighterId of touchedFighterIds) {
      invalidateFighter(fighterId, gangId);
    }

    const failures = results.filter((r) => r.failed);

    return {
      success: failures.length === 0,
      error:
        failures.length > 0
          ? `${failures.length} of ${results.length} Post-cycle Actions could not be applied.`
          : undefined,
      results,
      gang: financials.newValues,
    };
  } catch (error) {
    console.error('Error applying Post-cycle Actions:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply Post-cycle Actions',
      results,
    };
  }
}
