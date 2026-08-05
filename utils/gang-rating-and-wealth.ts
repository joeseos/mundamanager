import { SupabaseClient } from '@supabase/supabase-js';
import { invalidateGangFinancials } from './cache-tags';

/** How many times to re-read and retry when a concurrent write beats us to the row. */
const MAX_FINANCIAL_ATTEMPTS = 3;

/** Backoff before a retry, multiplied by attempt number, so the winning write can commit. */
const RETRY_BACKOFF_MS = 25;

/**
 * Pin one column to the value we read. Nullable columns need .is() — .eq(col, null)
 * does not match NULL in PostgREST, which would make the compare-and-swap never succeed.
 */
function matchCurrentValue(query: any, column: string, value: number | null) {
  return value === null ? query.is(column, null) : query.eq(column, value);
}

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
    // The new values are computed in JS from the current ones, so the write has to be
    // conditional on the row still holding what we read — otherwise two concurrent
    // purchases both read the same balance and the second silently clobbers the first's
    // deduction. Matching every column we write turns this into a compare-and-swap: a
    // conflicting write makes the UPDATE match 0 rows, and we re-read and try again.
    for (let attempt = 1; attempt <= MAX_FINANCIAL_ATTEMPTS; attempt++) {
      const { data: gangRow, error: selectError } = await supabase
        .from('gangs')
        .select('credits, rating, wealth, trade_points')
        .eq('id', gangId)
        .single();

      if (selectError || !gangRow) {
        return { success: false, error: selectError?.message || 'Gang not found' };
      }

      // Keep the raw values too: credits/rating/wealth are nullable, and a NULL has to be
      // matched with .is() rather than .eq() for the compare-and-swap to hold.
      const rawCredits = (gangRow.credits ?? null) as number | null;
      const rawRating = (gangRow.rating ?? null) as number | null;
      const rawWealth = (gangRow.wealth ?? null) as number | null;
      const rawTradePoints = (gangRow.trade_points ?? null) as number | null;

      const currentCredits = rawCredits ?? 0;
      const currentRating = rawRating ?? 0;
      const currentWealth = rawWealth ?? 0;
      const currentTradePoints = rawTradePoints ?? 0;

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

      // Returning the row from the UPDATE also saves a follow-up SELECT.
      let query = supabase
        .from('gangs')
        .update(expectedValues)
        .eq('id', gangId);
      query = matchCurrentValue(query, 'credits', rawCredits);
      query = matchCurrentValue(query, 'rating', rawRating);
      query = matchCurrentValue(query, 'wealth', rawWealth);
      query = matchCurrentValue(query, 'trade_points', rawTradePoints);

      const { data: updatedRows, error: updateError } = await query
        .select('credits, rating, wealth, trade_points');

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      const updatedGangRow = updatedRows?.[0];
      if (updatedGangRow) {
        invalidateGangFinancials(gangId);
        return {
          success: true,
          oldValues,
          newValues: {
            credits: (updatedGangRow.credits ?? 0) as number,
            rating: (updatedGangRow.rating ?? 0) as number,
            wealth: (updatedGangRow.wealth ?? 0) as number,
            trade_points: (updatedGangRow.trade_points ?? 0) as number
          }
        };
      }
      // 0 rows matched: another write landed between our read and write. Back off briefly
      // so the competing write can commit, then re-read and recompute.
      if (attempt < MAX_FINANCIAL_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, RETRY_BACKOFF_MS * attempt));
      }
    }

    // Not every caller inspects the result — some fire-and-forget rating or wealth
    // adjustments — so log here rather than relying on them to surface it.
    console.error(
      `Gang financials update for ${gangId} gave up after ${MAX_FINANCIAL_ATTEMPTS} attempts ` +
      `(concurrent modification); deltas:`,
      { creditsDelta, tradePointsDelta, ratingDelta: effectiveRatingDelta, stashValueDelta }
    );

    return {
      success: false,
      error: 'Gang financials were modified concurrently; please retry'
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
