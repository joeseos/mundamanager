export const UNDERHIVE_OUTCASTS_GANG_TYPE_ID = '77fc520f-b453-46ef-9ef0-6a12872934f8';
export const ARCHETYPE_ELIGIBLE_FIGHTER_CLASSES = ['Leader', 'Champion'];

/**
 * Returns true when a fighter belongs to an Underhive Outcasts gang
 * and holds a class that can be assigned a skill archetype.
 */
export function isArchetypeEligible(params: {
  gangTypeId?: string | null;
  fighterClass?: string | null;
}): boolean {
  return (
    params.gangTypeId === UNDERHIVE_OUTCASTS_GANG_TYPE_ID &&
    ARCHETYPE_ELIGIBLE_FIGHTER_CLASSES.includes(params.fighterClass || '')
  );
}
