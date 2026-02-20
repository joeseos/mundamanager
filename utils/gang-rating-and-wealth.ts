import { SupabaseClient } from '@supabase/supabase-js';
import { invalidateGangRating } from './cache-tags';

export interface GangFinancialUpdateOptions {
  gangId: string;
  ratingDelta?: number;      // Change to rating
  creditsDelta?: number;     // Credits gained (positive) or spent (negative)
  stashValueDelta?: number;  // Stash value change (affects wealth only)
  applyToRating?: boolean;   // false = skip rating update (inactive fighter)
}

export interface GangFinancialUpdateResult {
  success: boolean;
  error?: string;
  oldValues?: { credits: number; rating: number; wealth: number };
  newValues?: { credits: number; rating: number; wealth: number };
}

/**
 * Updates gang credits, rating, and wealth atomically via a Postgres
 * SELECT FOR UPDATE RPC. Concurrent callers on the same gang are serialized
 * by the row lock, so there are no spurious failures.
 *
 * Wealth formula: newWealth = currentWealth + effectiveRatingDelta + creditsDelta + stashValueDelta
 * Where effectiveRatingDelta = ratingDelta if applyToRating is true (default), else 0.
 */
export async function updateGangFinancials(
  supabase: SupabaseClient,
  options: GangFinancialUpdateOptions
): Promise<GangFinancialUpdateResult> {
  const {
    gangId,
    ratingDelta = 0,
    creditsDelta = 0,
    stashValueDelta = 0,
    applyToRating = true
  } = options;

  const effectiveRatingDelta = applyToRating ? ratingDelta : 0;

  // No-op shortcut: nothing to change
  if (effectiveRatingDelta === 0 && creditsDelta === 0 && stashValueDelta === 0) {
    return { success: true };
  }

  try {
    const { data, error } = await supabase.rpc('update_gang_financials', {
      p_gang_id: gangId,
      p_credits_delta: creditsDelta,
      p_rating_delta: effectiveRatingDelta,
      p_stash_value_delta: stashValueDelta
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const result = data as {
      success: boolean;
      error?: string;
      old_values?: { credits: number; rating: number; wealth: number };
      new_values?: { credits: number; rating: number; wealth: number };
    };

    if (!result.success) {
      return {
        success: false,
        error: result.error,
        oldValues: result.old_values
      };
    }

    invalidateGangRating(gangId);

    return {
      success: true,
      oldValues: result.old_values,
      newValues: result.new_values
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    console.error('Failed to update gang financials:', e);
    return { success: false, error: errorMessage };
  }
}

/**
 * Convenience function for simple rating/wealth updates where delta applies equally to both.
 *
 * This is equivalent to calling updateGangFinancials with ratingDelta = delta.
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
