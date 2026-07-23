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

/**
 * Core sorting engine that sorts items based on a gang's positioning map using explicit key extractors.
 */
export function sortByPositioning<T>(
  items: T[],
  positioning: Record<string, any> | null | undefined,
  getId: (item: T) => string,
  getName?: (item: T) => string | undefined
): T[] {
  if (!items || items.length === 0) return [];

  const posMap = new Map<string, number>();
  if (positioning) {
    Object.entries(positioning).forEach(([pos, fighterId]) => {
      posMap.set(String(fighterId), Number(pos));
    });
  }

  return [...items].sort((a, b) => {
    const idA = getId(a);
    const idB = getId(b);
    const posA = idA && posMap.has(idA) ? posMap.get(idA)! : Number.MAX_SAFE_INTEGER;
    const posB = idB && posMap.has(idB) ? posMap.get(idB)! : Number.MAX_SAFE_INTEGER;

    if (posA !== posB) return posA - posB;

    const nameA = getName ? getName(a) ?? '' : '';
    const nameB = getName ? getName(b) ?? '' : '';
    return nameA.localeCompare(nameB);
  });
}

/**
 * Sorts Gang Fighters (which identify fighters by `.id`) according to the gang's positioning map.
 */
export const sortFightersByPositioning = <T extends { id: string; fighter_name?: string }>(
  fighters: T[],
  positioning?: Record<string, any> | null
) => sortByPositioning(fighters, positioning, (f) => f.id, (f) => f.fighter_name);

/**
 * Sorts Battle Session Participant Fighters (which reference their gang fighter via `.fighter_id`)
 * according to the gang's positioning map.
 */
export const sortParticipantFightersByPositioning = <
  T extends { fighter_id: string; fighter?: { fighter_name?: string } }
>(
  fighters: T[],
  positioning?: Record<string, any> | null
) => sortByPositioning(fighters, positioning, (f) => f.fighter_id, (f) => f.fighter?.fighter_name);


