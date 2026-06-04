export const UNDERHIVE_OUTCASTS_GANG_TYPE_ID = '77fc520f-b453-46ef-9ef0-6a12872934f8';
export const ARCHETYPE_ELIGIBLE_FIGHTER_CLASSES = ['Leader', 'Champion'];

const ARCHETYPE_OVERRIDE_ACCESS_LEVELS = new Set(['primary', 'secondary', 'allowed']);

export type ArchetypeSkillAccessOverride = {
  skill_type_id: string;
  access_level: 'primary' | 'secondary' | 'allowed';
};

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

/**
 * Maps archetype skill_access JSON to fighter_skill_access_override rows.
 * Used by both add-fighter and edit-fighter paths so overrides stay consistent.
 */
export function mapArchetypeSkillAccessToOverrides(
  skillAccess: Array<{ skill_type_id: string; access_level: string }>
): ArchetypeSkillAccessOverride[] {
  return skillAccess
    .filter(sa => ARCHETYPE_OVERRIDE_ACCESS_LEVELS.has(sa.access_level))
    .map(sa => ({
      skill_type_id: sa.skill_type_id,
      access_level: sa.access_level as ArchetypeSkillAccessOverride['access_level'],
    }));
}
