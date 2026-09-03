/**
 * The gang's positioning map, falling back to a default alphabetical order when
 * the gang has never been reordered.
 *
 * Derived, never persisted. This used to UPDATE gangs.positioning during the page
 * render, which was wrong three ways: the write is not allowed to invalidate its
 * own cache entry (revalidateTag throws during render, and doing it in after()
 * would evict the entry the render just read), so gang-positioning-{id} kept
 * serving the cached null and the write repeated on EVERY page load; the default
 * was therefore recomputed from the current roster each time anyway, so nothing
 * was gained by storing it; and for anyone but the owner the UPDATE matched zero
 * rows under the gangs RLS policy and the result was never checked.
 *
 * Only an explicit reorder persists a positioning map, and that path invalidates
 * the cache entry properly (app/actions/update-gang-positioning.ts).
 */
export function resolvePositioning(
  positioning: Record<string, any> | null,
  fighters: Array<{ id: string; fighter_name: string }>
): Record<string, any> {
  if (positioning && Object.keys(positioning).length > 0) return positioning;

  return [...fighters]
    .sort((a, b) => a.fighter_name.localeCompare(b.fighter_name))
    .reduce<Record<string, string>>((acc, fighter, index) => {
      acc[index] = fighter.id;
      return acc;
    }, {});
}

/**
 * Core sorting engine that sorts items based on a gang's positioning map using explicit key extractors.
 * Preserves original array order stability for unpositioned items to match Gang Overview sorting.
 *
 * When two items share the same position index, `tiebreak` (if provided) decides their order;
 * otherwise their relative order is preserved (stable sort).
 */
export function sortByPositioning<T>(
  items: T[],
  positioning: Record<string, any> | null | undefined,
  getId: (item: T) => string,
  tiebreak?: (a: T, b: T) => number
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
    return tiebreak ? tiebreak(a, b) : 0;
  });
}

/**
 * Sorts Gang Fighters (which identify fighters by `.id`) according to the gang's positioning map.
 */
export const sortFightersByPositioning = <T extends { id: string }>(
  fighters: T[],
  positioning?: Record<string, any> | null,
  tiebreak?: (a: T, b: T) => number
) => sortByPositioning(fighters, positioning, (f) => f.id, tiebreak);

/**
 * Sorts Battle Session Participant Fighters (which reference their gang fighter via `.fighter_id`)
 * according to the gang's positioning map.
 */
export const sortParticipantFightersByPositioning = <T extends { fighter_id: string }>(
  fighters: T[],
  positioning?: Record<string, any> | null
) => sortByPositioning(fighters, positioning, (f) => f.fighter_id);


