/**
 * Outcasts gang type IDs for skill-archetype eligibility.
 * Replaces the old single UNDERHIVE_OUTCASTS_GANG_TYPE_ID export — use the
 * edition-specific constant (N23 vs N26).
 */
export const N23_UNDERHIVE_OUTCASTS_GANG_TYPE_ID = '77fc520f-b453-46ef-9ef0-6a12872934f8';
export const N26_UNDERHIVE_OUTCASTS_GANG_TYPE_ID = 'e3a5fbf4-edc8-4d85-be05-6d5ad0b0d627';

/**
 * Eligible subtypes per Outcasts gang type.
 * Array order is catalog priority when several eligible subtypes are selected
 * (Leader > Champion > Ganger). Matches Outcasts skill-access archetype tables:
 * when a fighter holds more than one qualifying subtype, the higher-priority
 * catalog drives skill access.
 */
const ARCHETYPE_ELIGIBLE_SUBTYPES_BY_GANG_TYPE: Record<string, readonly string[]> = {
  [N23_UNDERHIVE_OUTCASTS_GANG_TYPE_ID]: ['Leader', 'Champion'],
  [N26_UNDERHIVE_OUTCASTS_GANG_TYPE_ID]: ['Leader', 'Champion', 'Ganger'],
};

const ARCHETYPE_OVERRIDE_ACCESS_LEVELS = new Set(['primary', 'secondary', 'allowed']);

export type ArchetypeSkillAccessOverride = {
  skill_type_id: string;
  access_level: 'primary' | 'secondary' | 'allowed';
};

function normalizeSubtypeList(
  fighterSubtypes?: Array<string | null | undefined> | null,
  fighterSubtype?: string | null
): string[] {
  if (fighterSubtypes?.length) {
    return fighterSubtypes.filter((name): name is string => Boolean(name));
  }
  return fighterSubtype ? [fighterSubtype] : [];
}

function getEligibleSubtypesForGang(gangTypeId?: string | null): readonly string[] | null {
  if (!gangTypeId) return null;
  return ARCHETYPE_ELIGIBLE_SUBTYPES_BY_GANG_TYPE[gangTypeId] ?? null;
}

/**
 * Returns true when a fighter belongs to an Underhive Outcasts gang (N23 or N26)
 * and holds at least one subtype that can be assigned a skill archetype for that gang.
 *
 * Prefer `fighterSubtypes` for multi-subtype fighters; `fighterSubtype`
 * remains for single-value call sites.
 */
export function isArchetypeEligible(params: {
  gangTypeId?: string | null;
  fighterSubtype?: string | null;
  fighterSubtypes?: Array<string | null | undefined> | null;
}): boolean {
  const eligible = getEligibleSubtypesForGang(params.gangTypeId);
  if (!eligible) return false;

  const subtypes = normalizeSubtypeList(params.fighterSubtypes, params.fighterSubtype);
  return subtypes.some((name) => eligible.includes(name));
}

/**
 * Picks which subtype drives the archetype catalog when several are present.
 * Follows the gang type's eligible-subtype order (Leader → Champion → Ganger for N26).
 */
export function getArchetypeCatalogSubtype(
  fighterSubtypes: Array<string | null | undefined> | null | undefined,
  options: {
    gangTypeId: string | null | undefined;
    fighterSubtype?: string | null;
  }
): string | null {
  const eligible = getEligibleSubtypesForGang(options.gangTypeId);
  if (!eligible) return null;

  const selected = new Set(
    normalizeSubtypeList(fighterSubtypes, options.fighterSubtype)
  );
  return eligible.find((name) => selected.has(name)) ?? null;
}

/**
 * True when an archetype belongs in this fighter's edition-scoped catalog.
 * `archetypeSubtypeId` comes from skill_access_archetypes.fighter_subtype_id;
 * null/empty means unrestricted (legacy rows with no subtype FK).
 */
export function isArchetypeInCatalog(params: {
  catalogSubtypeId?: string | null;
  archetypeSubtypeId?: string | null;
}): boolean {
  if (!params.archetypeSubtypeId) return true;
  return Boolean(params.catalogSubtypeId) && params.catalogSubtypeId === params.archetypeSubtypeId;
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
