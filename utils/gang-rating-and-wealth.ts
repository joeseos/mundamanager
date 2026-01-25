import { SupabaseClient } from '@supabase/supabase-js';
import { invalidateGangRating } from './cache-tags';

export interface GangFinancialUpdateOptions {
  gangId: string;
  ratingDelta?: number;      // Change to rating
  creditsDelta?: number;     // Credits gained/spent (affects wealth only)
  stashValueDelta?: number;  // Stash value change (affects wealth only)
  applyToRating?: boolean;   // false = skip rating update (inactive fighter)
}

/**
 * Updates gang rating and wealth in a single operation.
 *
 * Wealth formula: newWealth = currentWealth + effectiveRatingDelta + creditsDelta + stashValueDelta
 * Where effectiveRatingDelta = ratingDelta if applyToRating is true (default), else 0.
 *
 * @param supabase - Supabase client instance
 * @param options - Update options
 * @returns Success status and optional error message
 */
export async function updateGangFinancials(
  supabase: SupabaseClient,
  options: GangFinancialUpdateOptions
): Promise<{ success: boolean; error?: string }> {
  const {
    gangId,
    ratingDelta = 0,
    creditsDelta = 0,
    stashValueDelta = 0,
    applyToRating = true
  } = options;

  // Calculate effective rating delta based on whether we should apply to rating
  const effectiveRatingDelta = applyToRating ? ratingDelta : 0;

  // Skip if nothing to update
  if (effectiveRatingDelta === 0 && creditsDelta === 0 && stashValueDelta === 0) {
    return { success: true };
  }

  try {
    // Get current gang values
    const { data: gangRow, error: selectError } = await supabase
      .from('gangs')
      .select('rating, wealth')
      .eq('id', gangId)
      .single();

    if (selectError || !gangRow) {
      return { success: false, error: selectError?.message || 'Gang not found' };
    }

    const currentRating = (gangRow.rating ?? 0) as number;
    const currentWealth = (gangRow.wealth ?? 0) as number;

    // Calculate new values
    // Wealth = rating change + credits change + stash value change
    const wealthDelta = effectiveRatingDelta + creditsDelta + stashValueDelta;

    const { error: updateError } = await supabase
      .from('gangs')
      .update({
        rating: Math.max(0, currentRating + effectiveRatingDelta),
        wealth: Math.max(0, currentWealth + wealthDelta)
      })
      .eq('id', gangId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    invalidateGangRating(gangId);
    return { success: true };
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
): Promise<{ success: boolean; error?: string }> {
  return updateGangFinancials(supabase, {
    gangId,
    ratingDelta: delta
  });
}
