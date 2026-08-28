/**
 * Venator gang skill access rulebook mapping (N26).
 *
 * Rulebook table:
 *
 *   | Fighter Type          | Primary | Secondary |
 *   | Venator Hunt Leader   | 1 & 2   | 3 & 4     |
 *   | Venator Hunt Champion | 1 & 2   | 3         |
 *   | Venator Specialist    | 1       | 2 & 3     |
 *
 * Fighter identity in the app lives in `fighters.fighter_subtypes` (JSONB
 * array). The subtype strings 'Leader', 'Champion', 'Specialist' are the
 * canonical values these rows key off, matching what get_available_skills
 * already uses.
 */

import { hasVenatorSkillAccess } from '@/types/edition';

/**
 * Canonical `gang_type` string for Venator gangs as stored in prod.
 * Centralised here so a single change fixes every check if prod diverges.
 */
export const VENATOR_GANG_TYPE_NAME = 'Venators';

/**
 * Returns true when both conditions hold:
 *   1. The edition has Venator skill-access rules (`hasVenatorSkillAccess`).
 *   2. The gang's `gang_type` string matches {@link VENATOR_GANG_TYPE_NAME}
 *      (case-insensitive).
 *
 * Use this instead of inlining the `.toLowerCase() === 'venators'` check so
 * that a prod string deviation only needs fixing in one place.
 */
export function isVenatorGang(
  editionSlug: string | null | undefined,
  gangType: string | null | undefined,
): boolean {
  return hasVenatorSkillAccess(editionSlug)
    && (gangType ?? '').toLowerCase() === VENATOR_GANG_TYPE_NAME.toLowerCase();
}

export type VenatorSubtype = 'Leader' | 'Champion' | 'Specialist';

export const VENATOR_RANK_ACCESS: Readonly<
  Record<VenatorSubtype, Readonly<Record<number, 'primary' | 'secondary'>>>
> = {
  Leader:     { 1: 'primary', 2: 'primary',   3: 'secondary', 4: 'secondary' },
  Champion:   { 1: 'primary', 2: 'primary',   3: 'secondary' },
  Specialist: { 1: 'primary', 2: 'secondary', 3: 'secondary' },
} as const;

const VENATOR_SUBTYPES: readonly VenatorSubtype[] = ['Leader', 'Champion', 'Specialist'];

const ACCESS_PRIORITY: Record<'primary' | 'secondary', number> = {
  primary:   2,
  secondary: 1,
};

/**
 * Derive per-fighter skill access overrides from a gang's ranked Skill Sets
 * and a fighter's subtypes. Pure function.
 *
 * - Returns an empty array if `ranks` is empty or `subtypes` contains none of
 *   the Venator subtype names.
 * - Multi-subtype resolution: if a fighter has more than one Venator subtype
 *   (allowed on N26), the highest access at each rank wins.
 */
export function deriveOverrides(
  ranks: readonly { rank: number; skill_type_id: string }[],
  subtypes: readonly string[],
): Array<{ skill_type_id: string; access_level: 'primary' | 'secondary' }> {
  const applicable = subtypes.filter((s): s is VenatorSubtype =>
    (VENATOR_SUBTYPES as readonly string[]).includes(s),
  );
  if (applicable.length === 0 || ranks.length === 0) return [];

  const chosen = new Map<string, 'primary' | 'secondary'>();
  for (const { rank, skill_type_id } of ranks) {
    let best: 'primary' | 'secondary' | undefined;
    for (const subtype of applicable) {
      const level = VENATOR_RANK_ACCESS[subtype][rank];
      if (!level) continue;
      if (!best || ACCESS_PRIORITY[level] > ACCESS_PRIORITY[best]) best = level;
    }
    if (best) chosen.set(skill_type_id, best);
  }
  return Array.from(chosen, ([skill_type_id, access_level]) => ({ skill_type_id, access_level }));
}
