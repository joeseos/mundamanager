export type SkillAccessLevel = 'primary' | 'secondary' | 'allowed' | 'denied';

export interface FormattedSkillAccess {
  skill_type_id: string;
  access_level: SkillAccessLevel | null;
  override_access_level: SkillAccessLevel | null;
  skill_type_name: string;
}

const ACCESS_RANK: Record<Exclude<SkillAccessLevel, 'denied'>, number> = {
  primary: 3,
  secondary: 2,
  allowed: 1,
};

/**
 * When a gang's Origin name matches a standard Skill Set name (e.g. "Trocken Mining Clan"),
 * fighters gain access to that Skill Set. Mining Clan Origins grant Primary access.
 */
export const GANG_ORIGIN_SKILL_ACCESS_LEVEL: Exclude<SkillAccessLevel, 'denied'> = 'primary';

export function pickStrongerSkillAccessLevel(
  a: SkillAccessLevel | null | undefined,
  b: SkillAccessLevel | null | undefined
): SkillAccessLevel | null {
  if (!a || a === 'denied') return b && b !== 'denied' ? b : null;
  if (!b || b === 'denied') return a;

  return ACCESS_RANK[a] >= ACCESS_RANK[b] ? a : b;
}

export function normaliseSkillSetName(name: string): string {
  return name.trim().toLowerCase();
}

export function findSkillTypeMatchingOriginName<T extends { id: string; name: string }>(
  skillTypes: T[],
  originName: string | null | undefined
): T | null {
  if (!originName?.trim()) return null;

  const normalisedOrigin = normaliseSkillSetName(originName);
  return (
    skillTypes.find((skillType) => normaliseSkillSetName(skillType.name) === normalisedOrigin) ??
    null
  );
}

/**
 * Merges Skill Set access granted by the gang's Origin into fighter skill access rows.
 * Origin access fills in missing defaults and upgrades weaker defaults; overrides are unchanged.
 */
export function applyGangOriginSkillAccess(
  skillAccess: FormattedSkillAccess[],
  originSkillType: { id: string; name: string } | null
): FormattedSkillAccess[] {
  if (!originSkillType) return skillAccess;

  const existingIndex = skillAccess.findIndex(
    (entry) => entry.skill_type_id === originSkillType.id
  );

  if (existingIndex >= 0) {
    const existing = skillAccess[existingIndex];
    const updated = [...skillAccess];
    updated[existingIndex] = {
      ...existing,
      access_level: pickStrongerSkillAccessLevel(
        existing.access_level,
        GANG_ORIGIN_SKILL_ACCESS_LEVEL
      ),
    };
    return updated;
  }

  return [
    ...skillAccess,
    {
      skill_type_id: originSkillType.id,
      access_level: GANG_ORIGIN_SKILL_ACCESS_LEVEL,
      override_access_level: null,
      skill_type_name: originSkillType.name,
    },
  ];
}
