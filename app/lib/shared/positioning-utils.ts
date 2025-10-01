import { SupabaseClient } from '@supabase/supabase-js';

export interface FighterWithId {
  id: string;
  fighter_name: string;
}

/**
 * Initialize or fix positioning for all fighters in a gang
 *
 * This function:
 * 1. Creates initial positions if none exist (sorted by fighter name)
 * 2. Removes positions for non-existent fighters
 * 3. Fixes gaps in position numbers
 * 4. Ensures all fighters have a position
 * 5. Updates the database if positions changed
 *
 * @param positioning - Current positioning data from gang
 * @param fighters - Array of fighters with at least id and fighter_name
 * @param gangId - Gang ID for database update
 * @param supabase - Supabase client
 * @returns Corrected positioning object
 */
export async function initializeOrFixPositioning(
  positioning: Record<string, any> | null,
  fighters: FighterWithId[],
  gangId: string,
  supabase: SupabaseClient
): Promise<Record<string, any>> {
  let updatedPositioning = positioning || {};

  // If no positions exist, create initial positions sorted by fighter name
  if (Object.keys(updatedPositioning).length === 0) {
    const sortedFighters = [...fighters].sort((a, b) =>
      a.fighter_name.localeCompare(b.fighter_name)
    );

    updatedPositioning = sortedFighters.reduce((acc, fighter, index) => ({
      ...acc,
      [index]: fighter.id
    }), {});
  } else {
    // First, filter out any positions referencing non-existent fighters
    const validFighterIds = new Set(fighters.map((f) => f.id));
    const validPositions: Record<string, string> = {};

    Object.entries(updatedPositioning as Record<string, string>).forEach(([pos, fighterId]) => {
      if (validFighterIds.has(fighterId)) {
        validPositions[pos] = fighterId;
      }
    });

    // Handle existing positions - fix any gaps
    const currentPositions = Object.keys(validPositions).map(pos => Number(pos)).sort((a, b) => a - b);
    let expectedPosition = 0;
    const positionMapping: Record<number, number> = {};

    currentPositions.forEach(position => {
      positionMapping[position] = expectedPosition;
      expectedPosition++;
    });

    // Create new positioning object with corrected positions
    const newPositioning: Record<number, string> = {};
    for (const [pos, fighterId] of Object.entries(validPositions)) {
      newPositioning[positionMapping[Number(pos)] ?? expectedPosition++] = fighterId;
    }
    updatedPositioning = newPositioning;

    // Make sure each fighter has a position
    fighters.forEach((fighter) => {
      if (!Object.values(updatedPositioning).includes(fighter.id)) {
        updatedPositioning[expectedPosition++] = fighter.id;
      }
    });
  }

  // Check if positions have changed from what's in the database
  const positionsHaveChanged = !positioning ||
    Object.entries(updatedPositioning).some(
      ([id, pos]) => positioning[id] !== pos
    );

  // Update database if positions have changed
  if (positionsHaveChanged) {
    const { error } = await supabase
      .from('gangs')
      .update({ positioning: updatedPositioning })
      .eq('id', gangId);

    if (error) {
      console.error('Error updating positions:', error);
    }
  }

  return updatedPositioning;
}