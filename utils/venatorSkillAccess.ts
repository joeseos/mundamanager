import { hasVenatorSkillAccess } from '@/types/edition';

export const VENATOR_GANG_TYPE_NAME = 'Venators';

export type VenatorSubtype = 'Leader' | 'Champion' | 'Specialist';

const VENATOR_SUBTYPES: readonly VenatorSubtype[] = ['Leader', 'Champion', 'Specialist'];

export const VENATOR_RANK_ACCESS: Readonly<
  Record<VenatorSubtype, Readonly<Record<number, 'primary' | 'secondary'>>>
> = {
  Leader:     { 1: 'primary', 2: 'primary',   3: 'secondary', 4: 'secondary' },
  Champion:   { 1: 'primary', 2: 'primary',   3: 'secondary' },
  Specialist: { 1: 'primary', 2: 'secondary', 3: 'secondary' },
} as const;

const ACCESS_PRIORITY: Record<'primary' | 'secondary', number> = {
  primary:   2,
  secondary: 1,
};

export function isVenatorGang(
  editionSlug: string | null | undefined,
  gangType: string | null | undefined,
  isCustomGangType: boolean,
): boolean {
  if (isCustomGangType) return false;
  return hasVenatorSkillAccess(editionSlug)
    && (gangType ?? '').toLowerCase() === VENATOR_GANG_TYPE_NAME.toLowerCase();
}

export const VENATOR_RANKS_INCOMPLETE_MESSAGE =
  "Venator Skill Sets aren't fully ranked. Finish this in Edit Gang.";

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
