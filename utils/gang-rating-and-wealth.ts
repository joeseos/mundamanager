import { SupabaseClient } from '@supabase/supabase-js';
import { DrizzleQueryError, eq } from 'drizzle-orm';
import { getUserIdFromClaims } from './auth';
import { invalidateGangFinancials } from './cache-tags';
import { getAppDb, withUserWrite } from './db/client';
import { gangs } from './db/schema';

/** Every gangs column this helper reads and writes. */
const financialColumns = {
  credits: gangs.credits,
  rating: gangs.rating,
  wealth: gangs.wealth,
  trade_points: gangs.trade_points,
  reputation: gangs.reputation,
};

export interface GangFinancialUpdateOptions {
  gangId: string;
  ratingDelta?: number;         // Change to rating
  creditsDelta?: number;        // Credits gained (positive) or spent (negative)
  tradePointsDelta?: number;    // N26 Trade Points gained (positive) or spent (negative)
  clearTradePoints?: boolean;   // Set Trade Points to 0, from the balance read under the row lock
  reputationDelta?: number;     // Reputation gained (positive) or spent (negative)
  stashValueDelta?: number;     // Stash value change (affects wealth only)
  applyToRating?: boolean;      // false = skip rating update (inactive fighter)
}

interface GangFinancialValues {
  credits: number;
  rating: number;
  wealth: number;
  trade_points: number;
  reputation: number;
}

export interface GangFinancialUpdateResult {
  success: boolean;
  error?: string;
  oldValues?: GangFinancialValues;
  newValues?: GangFinancialValues;
}

function toFinancialValues(row: { [K in keyof GangFinancialValues]: number | null }): GangFinancialValues {
  return {
    credits: row.credits ?? 0,
    rating: row.rating ?? 0,
    wealth: row.wealth ?? 0,
    trade_points: row.trade_points ?? 0,
    reputation: row.reputation ?? 0
  };
}

/**
 * Updates every gang value that lives on the gangs row — credits, rating, wealth, Trade
 * Points and reputation — in a single operation.
 *
 * A purchase can be paid in credits, Trade Points or reputation, sometimes more than one
 * at a time, so they all move together in one UPDATE rather than as separate deductions
 * that could leave one spent and another not.
 *
 * Wealth formula: newWealth = currentWealth + effectiveRatingDelta + creditsDelta + stashValueDelta
 * Where effectiveRatingDelta = ratingDelta if applyToRating is true (default), else 0.
 * Trade Points and reputation are separate currencies and deliberately do not feed wealth.
 *
 * Runs over the direct database connection as the signed-in user, so it adds no API
 * gateway log entries and the gangs RLS policies apply as before.
 *
 * @param supabase - The request's Supabase client, used to identify the signed-in user
 * @param options - Update options
 * @returns Success status, optional error message, and old/new values for logging
 */
export async function updateGangFinancials(
  supabase: SupabaseClient,
  options: GangFinancialUpdateOptions
): Promise<GangFinancialUpdateResult> {
  const {
    gangId,
    ratingDelta = 0,
    creditsDelta = 0,
    tradePointsDelta = 0,
    clearTradePoints = false,
    reputationDelta = 0,
    stashValueDelta = 0,
    applyToRating = true
  } = options;

  // Calculate effective rating delta based on whether we should apply to rating
  const effectiveRatingDelta = applyToRating ? ratingDelta : 0;

  // Skip if nothing to update
  if (effectiveRatingDelta === 0 && creditsDelta === 0 && tradePointsDelta === 0 && !clearTradePoints &&
      reputationDelta === 0 && stashValueDelta === 0) {
    // Still fetch current values for logging. Every signed-in user may read gangs, so no claims are needed.
    try {
      const [gangRow] = await getAppDb()
        .select(financialColumns)
        .from(gangs)
        .where(eq(gangs.id, gangId));

      if (gangRow) {
        const unchanged = toFinancialValues(gangRow);
        return { success: true, oldValues: unchanged, newValues: unchanged };
      }
    } catch (e) {
      // Fall through to return success: true
    }
    return { success: true };
  }

  try {
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return { success: false, error: 'User not authenticated' };
    }

    const result = await withUserWrite(userId, async (tx): Promise<GangFinancialUpdateResult> => {
      // The new values are computed from the current ones, so the row is locked when read:
      // a concurrent purchase waits here until this one commits, then reads its result.
      const [gangRow] = await tx
        .select(financialColumns)
        .from(gangs)
        .where(eq(gangs.id, gangId))
        .for('update');

      if (!gangRow) {
        return { success: false, error: 'Gang not found' };
      }

      const oldValues = toFinancialValues(gangRow);

      if (oldValues.credits + creditsDelta < 0) {
        return { success: false, error: 'Insufficient credits' };
      }

      const tradePointsChange = clearTradePoints ? -oldValues.trade_points : tradePointsDelta;
      if (oldValues.trade_points + tradePointsChange < 0) {
        return { success: false, error: 'Insufficient Trade Points' };
      }

      if (oldValues.reputation + reputationDelta < 0) {
        return { success: false, error: 'Insufficient Reputation' };
      }

      // Wealth = rating change + credits change + stash value change. Trade Points and
      // reputation are separate currencies and do not feed it.
      const wealthDelta = effectiveRatingDelta + creditsDelta + stashValueDelta;
      const [updatedRow] = await tx
        .update(gangs)
        .set({
          credits: Math.max(0, oldValues.credits + creditsDelta),
          rating: Math.max(0, oldValues.rating + effectiveRatingDelta),
          wealth: Math.max(0, oldValues.wealth + wealthDelta),
          trade_points: Math.max(0, oldValues.trade_points + tradePointsChange),
          reputation: Math.max(0, oldValues.reputation + reputationDelta)
        })
        .where(eq(gangs.id, gangId))
        .returning(financialColumns);

      return { success: true, oldValues, newValues: toFinancialValues(updatedRow) };
    });

    if (result.success) {
      invalidateGangFinancials(gangId);
    }
    return result;
  } catch (e) {
    console.error('Failed to update gang rating and wealth:', e);
    // A failed Drizzle query's message holds its SQL and parameters, so it stays in the server log.
    return {
      success: false,
      error: e instanceof Error && !(e instanceof DrizzleQueryError) ? e.message : 'Failed to update gang credits and rating'
    };
  }
}

/**
 * Convenience function for simple rating/wealth updates where delta applies equally to both.
 *
 * This is equivalent to calling updateGangFinancials with ratingDelta = delta.
 *
 * @param supabase - Supabase client instance
 * @param gangId - The gang ID to update
 * @param delta - The amount to add to both rating and wealth
 * @returns Success status and optional error message
 */
export async function updateGangRatingSimple(
  supabase: SupabaseClient,
  gangId: string,
  delta: number
): Promise<GangFinancialUpdateResult> {
  return updateGangFinancials(supabase, {
    gangId,
    ratingDelta: delta
  });
}
