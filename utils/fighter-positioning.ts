/**
 * Initialize or fix fighter positioning
 * - Creates initial positions if none exist
 * - Removes positions for deleted fighters
 * - Fixes gaps in position numbers
 * - Updates database if positions changed
 */
export async function initializeOrFixPositioning(
  positioning: Record<string, any> | null,
  fighters: Array<{ id: string; fighter_name: string }>,
  gangId: string,
  supabase: any
): Promise<Record<string, any>> {
  let pos = positioning || {};

  // If no positions exist, create initial positions sorted by fighter name
  if (Object.keys(pos).length === 0) {
    const sortedFighters = [...fighters].sort((a, b) =>
      a.fighter_name.localeCompare(b.fighter_name)
    );

    pos = sortedFighters.reduce((acc, fighter, index) => ({
      ...acc,
      [index]: fighter.id
    }), {});
  } else {
    // Filter out positions referencing non-existent fighters
    const validFighterIds = new Set(fighters.map(f => f.id));
    const validPositions: Record<string, string> = {};

    Object.entries(pos as Record<string, string>).forEach(([position, fighterId]) => {
      if (validFighterIds.has(fighterId)) {
        validPositions[position] = fighterId;
      }
    });

    // Fix gaps in position numbers
    const currentPositions = Object.keys(validPositions).map(p => Number(p)).sort((a, b) => a - b);
    let expectedPosition = 0;
    const positionMapping: Record<number, number> = {};

    currentPositions.forEach(position => {
      positionMapping[position] = expectedPosition;
      expectedPosition++;
    });

    // Create new positioning with corrected positions
    const newPositioning: Record<number, string> = {};
    for (const [position, fighterId] of Object.entries(validPositions)) {
      newPositioning[positionMapping[Number(position)] ?? expectedPosition++] = fighterId;
    }
    pos = newPositioning;

    // Ensure each fighter has a position
    fighters.forEach(fighter => {
      if (!Object.values(pos).includes(fighter.id)) {
        pos[expectedPosition++] = fighter.id;
      }
    });
  }

  // Check if positions changed
  const positionsChanged = !positioning ||
    Object.entries(pos).some(([id, fId]) => positioning[id] !== fId);

  // Update database if positions changed
  if (positionsChanged) {
    const { error } = await supabase
      .from('gangs')
      .update({ positioning: pos })
      .eq('id', gangId);

    if (error) {
      console.error('Error updating positions:', error);
    }
  }

  return pos;
}

