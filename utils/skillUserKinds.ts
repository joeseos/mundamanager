export const SKILL_USER_KINDS = ['fighter', 'walker', 'vehicle'] as const;
export type SkillUserKind = (typeof SKILL_USER_KINDS)[number];

const SKILL_USER_KIND_LABEL: Record<SkillUserKind, string> = {
  fighter: 'Fighter',
  walker: 'Walker',
  vehicle: 'Vehicle',
};

function parseKind(value: string): SkillUserKind | null {
  const kind = value.trim().toLowerCase();
  return SKILL_USER_KINDS.find((allowed) => allowed === kind) ?? null;
}

/**
 * Unique kinds in book order: fighter, walker, vehicle. Empty → null
 * (no restriction). Unknown values are dropped.
 */
export function normalizeSkillUserKinds(value: unknown): SkillUserKind[] | null {
  if (!Array.isArray(value)) return null;

  const seen = new Set<SkillUserKind>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const kind = parseKind(item);
    if (kind) seen.add(kind);
  }
  if (seen.size === 0) return null;
  return SKILL_USER_KINDS.filter((kind) => seen.has(kind));
}

/** Reject unknown kinds so the CHECK is not the first error the admin sees. */
export function resolveSkillUserKinds(
  value: unknown
): { kinds: SkillUserKind[] | null } | { error: string } {
  if (!Array.isArray(value)) return { kinds: null };

  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (!parseKind(trimmed)) {
      return {
        error: `usable_by value ${trimmed} is not fighter, walker, or vehicle`,
      };
    }
  }

  return { kinds: normalizeSkillUserKinds(value) };
}

export function usableByDbErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('message' in error)) return null;
  const message = error.message;
  if (typeof message !== 'string' || !message.includes('usable_by')) return null;
  return message;
}

export function skillUserKindLabel(kind: string): string {
  const parsed = parseKind(kind);
  return parsed ? SKILL_USER_KIND_LABEL[parsed] : kind;
}

/**
 * Combobox secondary for skill names, e.g. " • Fighter" or
 * " • Fighter or Walker". Empty string when unrestricted.
 */
export function formatSkillUserKindSuffix(
  kinds: readonly string[] | null | undefined
): string {
  const normalized = normalizeSkillUserKinds(kinds ?? null);
  if (!normalized) return '';
  const labels = normalized.map((kind) => SKILL_USER_KIND_LABEL[kind]);
  return ` \u2022 ${labels.join(' or ')}`;
}

/** Same roster check as get_available_skills: null usable_by is unrestricted. */
export function isSkillUsableByRoster(
  usableBy: readonly string[] | null | undefined,
  opts: { isVehicle: boolean; isWalker: boolean }
): boolean {
  const kinds = normalizeSkillUserKinds(usableBy ?? null);
  if (!kinds) return true;
  if (!opts.isVehicle && kinds.includes('fighter')) return true;
  if (opts.isVehicle && kinds.includes('vehicle')) return true;
  if (opts.isWalker && kinds.includes('walker')) return true;
  return false;
}
