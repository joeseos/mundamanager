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
 * Updates gang credits, rating, and wealth in a single operation.
 *
 * Wealth formula: newWealth = currentWealth + effectiveRatingDelta + creditsDelta + stashValueDelta
 * Where effectiveRatingDelta = ratingDelta if applyToRating is true (default), else 0.
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
    stashValueDelta = 0,
    applyToRating = true
  } = options;

  // Calculate effective rating delta based on whether we should apply to rating
  const effectiveRatingDelta = applyToRating ? ratingDelta : 0;

  // Skip if nothing to update
  if (effectiveRatingDelta === 0 && creditsDelta === 0 && stashValueDelta === 0) {
    // Still fetch current values for logging
    try {
      const { data: gangRow } = await supabase
        .from('gangs')
        .select('credits, rating, wealth')
        .eq('id', gangId)
        .single();
      
      if (gangRow) {
        return {
          success: true,
          oldValues: {
            credits: (gangRow.credits ?? 0) as number,
            rating: (gangRow.rating ?? 0) as number,
            wealth: (gangRow.wealth ?? 0) as number
          },
          newValues: {
            credits: (gangRow.credits ?? 0) as number,
            rating: (gangRow.rating ?? 0) as number,
            wealth: (gangRow.wealth ?? 0) as number
          }
        };
      }
    } catch (e) {
      // Fall through to return success: true
    }
    return { success: true };
  }

  // CAS (Compare-And-Swap) loop: read current values, attempt update with
  // .eq() guards on all three columns. If another request modified the row
  // between our read and write, the UPDATE matches 0 rows and we retry once.
  const MAX_CAS_RETRIES = 1;

  try {
    for (let attempt = 0; attempt <= MAX_CAS_RETRIES; attempt++) {
      // Read current values
      const { data: gangRow, error: selectError } = await supabase
        .from('gangs')
        .select('credits, rating, wealth')
        .eq('id', gangId)
        .single();

      if (selectError || !gangRow) {
        return { success: false, error: selectError?.message || 'Gang not found' };
      }

      const currentCredits = (gangRow.credits ?? 0) as number;
      const currentRating = (gangRow.rating ?? 0) as number;
      const currentWealth = (gangRow.wealth ?? 0) as number;

      // Overdraft check (fail fast, no retry needed)
      if (creditsDelta < 0 && currentCredits + creditsDelta < 0) {
        return {
          success: false,
          error: 'Insufficient credits',
          oldValues: { credits: currentCredits, rating: currentRating, wealth: currentWealth }
        };
      }

      // Calculate new values
      const wealthDelta = effectiveRatingDelta + creditsDelta + stashValueDelta;
      const newCredits = Math.max(0, currentCredits + creditsDelta);
      const newRating = Math.max(0, currentRating + effectiveRatingDelta);
      const newWealth = Math.max(0, currentWealth + wealthDelta);

      // CAS update: .eq() guards ensure this is a no-op if values changed
      // since our read. Chain .select() to get new values back (replaces
      // the separate post-update fetch).
      const { data: updated, error: updateError } = await supabase
        .from('gangs')
        .update({ credits: newCredits, rating: newRating, wealth: newWealth })
        .eq('id', gangId)
        .eq('credits', currentCredits)
        .eq('rating', currentRating)
        .eq('wealth', currentWealth)
        .select('credits, rating, wealth');

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      // CAS succeeded — row was updated
      if (updated && updated.length > 0) {
        invalidateGangRating(gangId);
        return {
          success: true,
          oldValues: { credits: currentCredits, rating: currentRating, wealth: currentWealth },
          newValues: {
            credits: (updated[0].credits ?? 0) as number,
            rating: (updated[0].rating ?? 0) as number,
            wealth: (updated[0].wealth ?? 0) as number
          }
        };
      }

      // CAS failed (0 rows updated) — another request modified the row.
      // Retry with fresh values on next iteration.
    }

    // All retries exhausted
    return { success: false, error: 'Concurrent modification detected, please try again' };
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
