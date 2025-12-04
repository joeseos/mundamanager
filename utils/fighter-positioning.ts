/**
 * Initialize positioning if needed (lazy initialization)
 * - Only creates initial positions if none exist
 * - Never "fixes" existing positions on page load
 * - Position fixes should happen via explicit user actions (reordering)
 */
export async function initializePositioningIfNeeded(
  positioning: Record<string, any> | null,
  fighters: Array<{ id: string; fighter_name: string }>,
  gangId: string,
  supabase: any
): Promise<Record<string, any>> {
  // Only create initial positions if none exist
  if (!positioning || Object.keys(positioning).length === 0) {
    const sortedFighters = [...fighters].sort((a, b) =>
      a.fighter_name.localeCompare(b.fighter_name)
    );

    const pos = sortedFighters.reduce((acc, fighter, index) => ({
      ...acc,
      [index]: fighter.id
    }), {});

    // Save initial positions
    await supabase
      .from('gangs')
      .update({ positioning: pos })
      .eq('id', gangId);

    return pos;
  }

  // Return existing positions as-is (don't fix on every load)
  return positioning;
}

