import { SupabaseClient } from '@supabase/supabase-js';
import { invalidateGangFinancials } from './cache-tags';

export interface GangFinancialUpdateOptions {
  gangId: string;
  ratingDelta?: number;         // Change to rating
  creditsDelta?: number;        // Credits gained (positive) or spent (negative)
  tradePointsDelta?: number;    // N26 Trade Points gained (positive) or spent (negative)
  stashValueDelta?: number;     // Stash value change (affects wealth only)
  applyToRating?: boolean;      // false = skip rating update (inactive fighter)
}

export interface GangFinancialUpdateResult {
  success: boolean;
  error?: string;
  oldValues?: { credits: number; rating: number; wealth: number; trade_points: number };
  newValues?: { credits: number; rating: number; wealth: number; trade_points: number };
}

/**
 * Updates gang credits, rating, wealth and Trade Points in a single operation.
 *
 * All four live on the gangs row, and an N26 purchase may spend credits and Trade Points
 * at once — so they move together in one UPDATE rather than as separate deductions that
 * could leave one spent and the other not.
 *
 * Wealth formula: newWealth = currentWealth + effectiveRatingDelta + creditsDelta + stashValueDelta
 * Where effectiveRatingDelta = ratingDelta if applyToRating is true (default), else 0.
 * Trade Points are a separate currency and deliberately do not feed wealth.
 *
 * @param supabase - Supabase client instance
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
    stashValueDelta = 0,
    applyToRating = true
  } = options;

  // Calculate effective rating delta based on whether we should apply to rating
  const effectiveRatingDelta = applyToRating ? ratingDelta : 0;

  // Skip if nothing to update
  if (effectiveRatingDelta === 0 && creditsDelta === 0 && tradePointsDelta === 0 && stashValueDelta === 0) {
    // Still fetch current values for logging
    try {
      const { data: gangRow } = await supabase
        .from('gangs')
        .select('credits, rating, wealth, trade_points')
        .eq('id', gangId)
        .single();

      if (gangRow) {
        const unchanged = {
          credits: (gangRow.credits ?? 0) as number,
          rating: (gangRow.rating ?? 0) as number,
          wealth: (gangRow.wealth ?? 0) as number,
          trade_points: (gangRow.trade_points ?? 0) as number
        };
        return { success: true, oldValues: unchanged, newValues: unchanged };
      }
    } catch (e) {
      // Fall through to return success: true
    }
    return { success: true };
  }

  try {
    // Get current gang values (old values)
    const { data: gangRow, error: selectError } = await supabase
      .from('gangs')
      .select('credits, rating, wealth, trade_points')
      .eq('id', gangId)
      .single();

    if (selectError || !gangRow) {
      return { success: false, error: selectError?.message || 'Gang not found' };
    }

    const currentCredits = (gangRow.credits ?? 0) as number;
    const currentRating = (gangRow.rating ?? 0) as number;
    const currentWealth = (gangRow.wealth ?? 0) as number;
    const currentTradePoints = (gangRow.trade_points ?? 0) as number;

    if (currentCredits + creditsDelta < 0) {
      return { success: false, error: 'Insufficient credits' };
    }

    if (currentTradePoints + tradePointsDelta < 0) {
      return { success: false, error: 'Insufficient Trade Points' };
    }

    // Calculate new values
    // Wealth = rating change + credits change + stash value change (Trade Points excluded)
    const wealthDelta = effectiveRatingDelta + creditsDelta + stashValueDelta;
    const expectedValues = {
      credits: Math.max(0, currentCredits + creditsDelta),
      rating: Math.max(0, currentRating + effectiveRatingDelta),
      wealth: Math.max(0, currentWealth + wealthDelta),
      trade_points: Math.max(0, currentTradePoints + tradePointsDelta)
    };
    const oldValues = {
      credits: currentCredits,
      rating: currentRating,
      wealth: currentWealth,
      trade_points: currentTradePoints
    };

    // Return the updated row from the UPDATE itself rather than re-reading it: one
    // statement instead of two, and the values are guaranteed to be the ones this
    // update wrote rather than whatever a concurrent writer left behind.
    const { data: updatedGangRow, error: updateError } = await supabase
      .from('gangs')
      .update(expectedValues)
      .eq('id', gangId)
      .select('credits, rating, wealth, trade_points')
      .single();

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    invalidateGangFinancials(gangId);
    return {
      success: true,
      oldValues,
      newValues: updatedGangRow
        ? {
            credits: (updatedGangRow.credits ?? 0) as number,
            rating: (updatedGangRow.rating ?? 0) as number,
            wealth: (updatedGangRow.wealth ?? 0) as number,
            trade_points: (updatedGangRow.trade_points ?? 0) as number
          }
        : expectedValues
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    console.error('Failed to update gang rating and wealth:', e);
    return { success: false, error: errorMessage };
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
