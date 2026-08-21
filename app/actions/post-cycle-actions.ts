'use server';

import { createClient } from '@/utils/supabase/server';
import { getAuthenticatedUser } from '@/utils/auth';
import { getEditionIdBySlug } from '@/app/lib/editions';
import { gangEditionSlug, EDITION_N26 } from '@/types/edition';
import {
  invalidateFighterData,
  invalidateGangFinancials,
  invalidateUserGangsList,
  CACHE_TAGS,
} from '@/utils/cache-tags';
import { revalidateTag } from 'next/cache';
import { updateGangFinancials } from '@/utils/gang-rating-and-wealth';
import { addFighterInjury, deleteFighterInjury } from './fighter-injury';
import { repairVehicleDamage } from './remove-vehicle-damage';
import { editFighterStatus, updateFighterXp } from './edit-fighter';
import { logPostCycleAction } from './logs/gang-post-cycle-logs';
import { addGangTacticsCards } from './gang-tactics-cards';
import type { GangTacticsCard } from '@/types/tactics-card';
import {
  FIT_BIONICS_COST_PER_INJURY,
  MEDICAL_ESCORT_COST,
  MEDICAL_ESCORT_GOOD_STUFF_STEP,
  TRAIN_XP,
  WORK_TERRITORY_INCOME,
  chopShopCostPerDamage,
  criticalInjuriesOf,
  postCycleTotalCredits,
  validatePostCycleAssignments,
  type PostCycleAssignment,
  type PostCycleFighter,
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

/**
 * A precise description of what changed on one fighter, so the gang page can
 * patch its client state instead of asking the player to reload.
 *
 * The gang page copies its server payload into `useState` once, so
 * `router.refresh()` alone would not update the fighter cards — the changes have
 * to be handed back explicitly.
 */
export interface PostCycleFighterChange {
  fighterId: string;
  /** Effect rows that were deleted, and which bucket they came out of. */
  removedEffectIds?: string[];
  removedFrom?: 'injuries' | 'lasting damages';
  /** A Lasting Injury applied by a Stabilised Medical Escort result. */
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

/** What one assignment actually did, so the UI can report each roll. */
export interface PostCycleActionOutcome {
  fighterId: string;
  fighterName: string;
  action: PostCycleAssignment['action'];
  targetFighterId?: string;
  targetFighterName?: string;
  /** Human-readable result, the same sentence written to the gang log. */
  outcome: string;
  /** Medical Escort only: the modified D6 and, on a Stabilised result, the D66. */
  roll?: { total: number; dice: number[]; label?: string };
  /**
   * Credits this action actually moved, negative for spend. Derived from what
   * happened rather than from what was requested, so a failed or partial action
   * is not billed in full.
   */
  creditsDelta: number;
  /** Cards a Develop Tactics action put on the roster, for the page's own list. */
  addedTacticsCards?: GangTacticsCard[];
  /** Per-fighter edits the caller should apply to its own state. */
  changes?: PostCycleFighterChange[];
  /** True when the action failed; `outcome` then carries the reason. */
  failed?: boolean;
}

export interface ApplyPostCycleActionsResult {
  success: boolean;
  error?: string;
  /** Populated even on a partial failure — see the atomicity note below. */
  results: PostCycleActionOutcome[];
  gang?: { credits: number; rating: number; wealth: number };
}

/** The effect categories this action reads. */
const INJURY_CATEGORY = 'injuries';
const LASTING_DAMAGE_CATEGORY = 'lasting damages';

/**
 * Read the fighters named by the assignments, with just enough of their effects
 * to re-validate the request. Deliberately a fresh read: the assignment list
 * comes from the browser and the rows it was built from may be stale.
 */
async function loadPostCycleFighters(
  supabase: any,
  gangId: string,
  fighterIds: string[]
): Promise<PostCycleFighter[]> {
  const { data: fighters, error: fightersError } = await supabase
    .from('fighters')
    .select(
      'id, fighter_name, fighter_type, fighter_subtypes, is_vehicle, killed, retired, enslaved, captured, recovery'
    )
    .eq('gang_id', gangId)
    .in('id', fighterIds);

  if (fightersError) throw new Error(fightersError.message || 'Failed to load fighters');
  if (!fighters?.length) throw new Error('No matching fighters found in this gang');

  const { data: effects, error: effectsError } = await supabase
    .from('fighter_effects')
    .select(
      `
      id,
      fighter_id,
      effect_name,
      type_specific_data,
      fighter_effect_type:fighter_effect_type_id (
        fighter_effect_category:fighter_effect_category_id ( category_name )
      )
    `
    )
    .in(
      'fighter_id',
      fighters.map((f: any) => f.id)
    )
    .is('vehicle_id', null);

  if (effectsError) throw new Error(effectsError.message || 'Failed to load fighter effects');

  const effectsByFighter = new Map<string, PostCycleFighter['effects']>();
  for (const effect of effects || []) {
    const category =
      effect.fighter_effect_type?.fighter_effect_category?.category_name || 'uncategorized';
    const bucket = effectsByFighter.get(effect.fighter_id) ?? {};
    (bucket[category] ??= []).push(effect as any);
    effectsByFighter.set(effect.fighter_id, bucket);
  }

  return fighters.map((fighter: any) => ({
    ...fighter,
    fighter_subtypes: fighter.fighter_subtypes ?? [],
    effects: effectsByFighter.get(fighter.id) ?? {},
  }));
}

/**
 * The `fighter_effect_types` row for an injury name in the gang's edition.
 * Names repeat across editions, so the edition id is part of the lookup.
 */
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
 * Resolve a whole Post-cycle Sequence: apply every fighter's chosen action, move
 * the gang's credits once, and log what each fighter did.
 *
 * NOT ATOMIC. Each action is applied through the existing per-fighter helpers
 * (deleteFighterInjury, addFighterInjury, repairVehicleDamage, updateFighterXp,
 * editFighterStatus) so that rating, wealth and cache invalidation stay in one
 * place — but that means a failure partway through leaves earlier actions
 * applied. The same trade-off `clearRigGlitchesDowntime` and
 * `repairVehicleDamage` already accept. `results` is returned either way, so the
 * caller can report exactly what landed rather than guessing.
 *
 * Authorization is RLS, matching every other mutation under app/actions.
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

    // ---- Gang, edition and the fighters involved -----------------------------

    const { data: gang, error: gangError } = await supabase
      .from('gangs')
      .select(
        `
        id, credits, rating, wealth,
        gang_types!gang_type_id ( editions:edition_id ( slug ) ),
        custom_gang_type_edition:custom_gang_types!custom_gang_type_id ( editions:edition_id ( slug ) )
      `
      )
      .eq('id', gangId)
      .single();

    if (gangError || !gang) {
      return { success: false, error: 'Gang not found', results };
    }

    const editionSlug = gangEditionSlug(gang);
    if (editionSlug !== EDITION_N26) {
      return {
        success: false,
        error: 'Post-cycle Actions are only available for Necromunda (2026) gangs',
        results,
      };
    }

    const involvedIds = Array.from(
      new Set(
        assignments.flatMap((assignment) =>
          assignment.action === 'medical_escort' || assignment.action === 'fit_bionics'
            ? [assignment.fighterId, assignment.targetFighterId]
            : [assignment.fighterId]
        )
      )
    );

    const fighters = await loadPostCycleFighters(supabase, gangId, involvedIds);
    const byId = new Map(fighters.map((f) => [f.id, f]));

    // ---- Re-validate against the rows we just read ---------------------------

    // Read directly rather than through getGangTacticsCards: that one is
    // unstable_cache'd, and this is a write path that must see current rows.
    let ownedTacticsCardIds = new Set<string>();
    if (assignments.some((a) => a.action === 'develop_tactics')) {
      const { data: ownedCards } = await supabase
        .from('gang_tactics_cards')
        .select('tactics_cards_id')
        .eq('gang_id', gangId);
      ownedTacticsCardIds = new Set(
        (ownedCards ?? []).map((row: any) => row.tactics_cards_id)
      );
    }

    const issues = validatePostCycleAssignments(fighters, assignments, {
      ownedTacticsCardIds,
    });
    if (issues.length > 0) {
      return { success: false, error: issues.map((i) => i.message).join(' '), results };
    }

    // ---- Affordability -------------------------------------------------------

    const totalCost = -postCycleTotalCredits(assignments);
    const startingCredits = gang.credits ?? 0;

    if (totalCost > 0 && startingCredits < totalCost) {
      return {
        success: false,
        error: `Not enough credits for these Post-cycle Actions. Required: ${totalCost}, Available: ${startingCredits}`,
        results,
      };
    }

    // ---- Apply ---------------------------------------------------------------

    const editionId = await getEditionIdBySlug(EDITION_N26);
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
        targetFighterId: target?.id,
        targetFighterName: target?.fighter_name,
      };

      touchedFighterIds.add(performer.id);
      if (target) touchedFighterIds.add(target.id);

      switch (assignment.action) {
        // -- Medical Escort ---------------------------------------------------
        case 'medical_escort': {
          const criticalInjury = criticalInjuriesOf(target!)[0];
          const escortCost = assignment.declineToPay
            ? 0
            : -(MEDICAL_ESCORT_COST +
                assignment.goodStuffSteps * MEDICAL_ESCORT_GOOD_STUFF_STEP);

          /**
           * editFighterStatus('kill') is a TOGGLE, so calling it on a fighter
           * that is already dead would resurrect them. Validation only proves
           * the target has a Critical Injury, which does not by itself rule out
           * a separate killing effect, so the state is checked here too.
           */
          const killTarget = async (): Promise<{ ok: boolean; error?: string }> => {
            if (target!.killed) return { ok: true };
            const killed = await editFighterStatus({
              fighter_id: target!.id,
              action: 'kill',
            });
            // Keep the snapshot honest for anything later in this same loop, so
            // a second toggle can never resurrect who we just killed.
            if (killed.success) target!.killed = true;
            return { ok: killed.success, error: killed.error };
          };

          // Refusing to pay skips the roll entirely: the fighter dies.
          if (assignment.declineToPay) {
            const killed = await killTarget();
            results.push({
              ...base,
              outcome: killed.ok
                ? `The gang declined to pay, so ${target!.fighter_name} died of their wounds.`
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
          const roll = { total, dice: [raw], label: escortResult };

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
              // The Doc was paid and the dice rolled, so a Complications result
              // is billed. A failure to write it back is not.
              creditsDelta: killed.ok ? escortCost : 0,
              changes: killed.ok ? [{ fighterId: target!.id, killed: true }] : undefined,
              failed: !killed.ok,
            });
            break;
          }

          /**
           * Resolve the Stabilised injury BEFORE touching anything. Deleting the
           * Critical Injury first and only then discovering the edition has no
           * row for the rolled injury would leave the fighter healed for free —
           * which is exactly what happens on N26 'Eye Injury', whose row is
           * missing from fighter_effect_types.
           */
          const stabilised =
            escortResult === 'Stabilised' ? medicalEscortStabilisedRoll() : null;
          const injuryEntry = stabilised
            ? resolveInjuryFor(stabilised.total, EDITION_N26)
            : undefined;
          const injuryTypeId =
            injuryEntry && editionId
              ? await findInjuryTypeId(supabase, injuryEntry.name, editionId)
              : null;

          if (stabilised && !injuryTypeId) {
            results.push({
              ...base,
              roll: { ...stabilised, label: injuryEntry?.name ?? 'Stabilised' },
              outcome:
                `Stabilised, but the Lasting Injury "${injuryEntry?.name ?? 'unknown'}" ` +
                `is not set up for this edition. Nothing was changed or charged — ` +
                `apply it by hand.`,
              creditsDelta: 0,
              failed: true,
            });
            break;
          }

          // Both surviving outcomes clear the Critical Injury first.
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
            const { error: recoveryError } = await supabase
              .from('fighters')
              .update({ recovery: true, updated_at: new Date().toISOString() })
              .eq('id', target!.id);

            if (recoveryError) {
              results.push({
                ...base,
                roll,
                outcome:
                  `Full Recovery rolled and the Critical Injury was cleared, but ` +
                  `sending ${target!.fighter_name} into Recovery failed: ${recoveryError.message}`,
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
                  removedFrom: 'injuries',
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
            roll: { ...stabilised!, label: injuryEntry!.name },
            outcome: applied.success
              ? `Stabilised: ${target!.fighter_name} suffers ${injuryEntry!.name}.`
              : `Stabilised, but applying ${injuryEntry!.name} failed: ${applied.error}`,
            // The Critical Injury is already gone either way, so the visit is billed.
            creditsDelta: escortCost,
            changes: [
              {
                fighterId: target!.id,
                removedEffectIds: criticalInjury ? [criticalInjury.id] : [],
                removedFrom: 'injuries',
                addedInjury: applied.injury,
                recovery: applied.recovery_status ?? true,
              },
            ],
            failed: !applied.success,
          });
          break;
        }

        // -- Fit Bionics ------------------------------------------------------
        case 'fit_bionics': {
          const removedNames: string[] = [];
          const removedIds: string[] = [];
          let failure: string | undefined;

          for (const injuryId of assignment.injuryIds) {
            const injury = (target!.effects?.[INJURY_CATEGORY] ?? []).find(
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
              ? `Removed ${removedNames.length} of ${assignment.injuryIds.length} Lasting Injuries before failing: ${failure}`
              : `Fitted bionics, removing ${removedNames.join(', ')} from ${target!.fighter_name}.`,
            // Billed per injury actually removed, not per injury requested.
            creditsDelta: -(removedIds.length * FIT_BIONICS_COST_PER_INJURY),
            changes: [
              {
                fighterId: target!.id,
                removedEffectIds: removedIds,
                removedFrom: 'injuries',
              },
            ],
            failed: Boolean(failure),
          });
          break;
        }

        // -- Visit Chop Shop --------------------------------------------------
        case 'visit_chop_shop': {
          const damages = performer.effects?.[LASTING_DAMAGE_CATEGORY] ?? [];
          const repairedNames = assignment.damageIds.map(
            (id) => damages.find((d) => d.id === id)?.effect_name ?? 'Lasting Damage'
          );

          // The N26 flat-rate path: the vehicle IS the fighter, hence vehicleId null.
          const repaired = await repairVehicleDamage({
            damageIds: assignment.damageIds,
            repairCost: assignment.damageIds.length * chopShopCostPerDamage(),
            vehicleId: null,
            fighterId: performer.id,
            gangId,
          });

          results.push({
            ...base,
            outcome: repaired.success
              ? `Repaired ${repairedNames.join(', ')} at the Chop Shop.`
              : `Chop Shop repair failed: ${repaired.error}`,
            // Settled inside repairVehicleDamage, so excluded from the aggregate below.
            creditsDelta: repaired.success
              ? -(assignment.damageIds.length * chopShopCostPerDamage())
              : 0,
            changes: repaired.success
              ? [
                  {
                    fighterId: performer.id,
                    removedEffectIds: assignment.damageIds,
                    removedFrom: 'lasting damages' as const,
                  },
                ]
              : undefined,
            failed: !repaired.success,
          });
          break;
        }

        // -- Train ------------------------------------------------------------
        case 'train': {
          const trained = await updateFighterXp({
            fighter_id: performer.id,
            xp_to_add: TRAIN_XP,
          });

          results.push({
            ...base,
            outcome: trained.success
              ? `Trained for ${TRAIN_XP} XP.`
              : `Failed to award XP: ${trained.error}`,
            creditsDelta: 0,
            changes: trained.success
              ? [{ fighterId: performer.id, xpDelta: TRAIN_XP }]
              : undefined,
            failed: !trained.success,
          });
          break;
        }

        // -- Credits-only and log-only actions --------------------------------
        case 'work_territory':
          results.push({
            ...base,
            outcome: `Worked a Territory for ${WORK_TERRITORY_INCOME} credits.`,
            creditsDelta: WORK_TERRITORY_INCOME,
          });
          break;

        case 'develop_tactics': {
          // Reuses the tactics action wholesale: it re-validates the ids against
          // the edition's catalogue, writes its own tactics_card_added logs and
          // invalidates the tactics cache.
          const addedCards = await addGangTacticsCards({
            gangId,
            tacticsCardIds: assignment.tacticsCardIds,
          });

          const names = (addedCards.data ?? []).map((card) => card.name);

          results.push({
            ...base,
            outcome: addedCards.success
              ? `Developed new Gang Tactics: ${names.join(', ')}.`
              : `Failed to add the Gang Tactics: ${addedCards.error}`,
            creditsDelta: 0,
            addedTacticsCards: addedCards.data,
            failed: !addedCards.success,
          });
          break;
        }

        case 'visit_trading_post':
          results.push({
            ...base,
            outcome:
              'Visited the Trading Post. Buy any equipment found from the Stash tab.',
            creditsDelta: 0,
          });
          break;
      }
    }

    // ---- Settle the credits that were not delegated --------------------------

    // Billed from the outcomes, not from the planned total: an action that
    // failed, or a Fit Bionics that removed two of the three injuries it was
    // asked to, must not be charged for what it did not do. Chop Shop is
    // excluded because repairVehicleDamage already took its payment.
    const settledDelta = results
      .filter((result) => result.action !== 'visit_chop_shop')
      .reduce((sum, result) => sum + result.creditsDelta, 0);

    if (settledDelta !== 0) {
      const financialResult = await updateGangFinancials(supabase, {
        gangId,
        creditsDelta: settledDelta,
      });

      if (!financialResult.success) {
        return {
          success: false,
          error: financialResult.error || 'Failed to update gang credits',
          results,
        };
      }
    }

    // Re-read rather than trusting the pre-write snapshot: the per-fighter
    // helpers above moved rating and wealth behind our back.
    const { data: finalGang } = await supabase
      .from('gangs')
      .select('credits, rating, wealth')
      .eq('id', gangId)
      .single();

    const after = {
      credits: finalGang?.credits ?? startingCredits,
      rating: finalGang?.rating ?? gang.rating ?? 0,
      wealth: finalGang?.wealth ?? gang.wealth ?? 0,
    };

    // ---- Log -----------------------------------------------------------------

    for (const result of results) {
      if (result.failed) continue;

      try {
        await logPostCycleAction({
          gang_id: gangId,
          fighter_id: result.fighterId,
          fighter_name: result.fighterName,
          action: result.action,
          target_fighter_name: result.targetFighterName,
          outcome: result.outcome,
          roll_total: result.roll?.total,
          roll_dice: result.roll?.dice,
          roll_label: result.roll?.label,
          credits_delta: result.creditsDelta === 0 ? undefined : result.creditsDelta,
          user_id: user.id,
        });
      } catch (logError) {
        console.error('Failed to log Post-cycle Action:', logError);
      }
    }

    // ---- Cache ---------------------------------------------------------------

    for (const fighterId of touchedFighterIds) {
      invalidateFighterData(fighterId, gangId);
      revalidateTag(CACHE_TAGS.BASE_FIGHTER_EFFECTS(fighterId), { expire: 0 });
      revalidateTag(CACHE_TAGS.BASE_FIGHTER_BASIC(fighterId), { expire: 0 });
    }
    invalidateGangFinancials(gangId);
    invalidateUserGangsList(user.id);

    const failures = results.filter((r) => r.failed);

    return {
      success: failures.length === 0,
      error:
        failures.length > 0
          ? `${failures.length} of ${results.length} Post-cycle Actions could not be applied.`
          : undefined,
      results,
      gang: after,
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
