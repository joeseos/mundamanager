import { withVariantGroups } from '@/utils/variantFamily';

export type CountLimitRule = {
  id?: string | null;
  gang_type_id?: string | null;
  gang_origin_id?: string | null;
  gang_subtype_id?: string | null;
  min_count?: number | null;
  max_count?: number | null;
};

/**
 * The most specific count_limits rule for this gang, matching get_fighter_types_with_cost:
 * subtype, then origin, then gang type, then a rule for every gang. id breaks a tie.
 */
export function resolveGangCountLimit(
  rules: CountLimitRule[] | null | undefined,
  gang: {
    gangTypeId?: string | null;
    gangOriginId?: string | null;
    gangSubtypeIds?: string[] | null;
  }
): { min_count: number | null; max_count: number | null } {
  const subtypeIds = new Set(gang.gangSubtypeIds ?? []);
  const matching = (rules ?? []).filter((rule) =>
    (rule.gang_type_id == null || rule.gang_type_id === gang.gangTypeId) &&
    (rule.gang_origin_id == null || rule.gang_origin_id === gang.gangOriginId) &&
    (rule.gang_subtype_id == null || subtypeIds.has(rule.gang_subtype_id))
  );
  matching.sort((a, b) => {
    const specificity = (rule: CountLimitRule) =>
      (rule.gang_subtype_id ? 4 : 0) + (rule.gang_origin_id ? 2 : 0) + (rule.gang_type_id ? 1 : 0);
    const bySpecificity = specificity(b) - specificity(a);
    if (bySpecificity !== 0) return bySpecificity;
    return (a.id ?? '').localeCompare(b.id ?? '');
  });
  const best = matching[0];
  return {
    min_count: best?.min_count ?? null,
    max_count: best?.max_count ?? null,
  };
}

export type FamilyTypeRow = {
  id: string;
  fighter_type: string;
  fighter_subtypes?: string[] | null;
  fighter_variant?: string | null;
  cost?: number | null;
  edition_slug?: string | null;
  count_limits?: CountLimitRule[] | null;
};

/**
 * Each fighter type id in a variant family, mapped to the base row's gang-scoped
 * limit. A non-variant row wins; otherwise the cheaper row does. Hired fighters
 * alone cannot supply this: a gang may hold only the variant, whose own
 * count_limits row is empty while the unhired base carries the cap.
 */
export function familyLimitsByTypeId(
  rows: FamilyTypeRow[],
  gang: {
    gangTypeId?: string | null;
    gangOriginId?: string | null;
    gangSubtypeIds?: string[] | null;
  }
): Map<string, { min_count: number | null; max_count: number | null; typeSubtypeKey: string }> {
  const tagged = withVariantGroups(rows);
  const representative = new Map<string, {
    fighter_variant: string | null;
    cost: number;
    min_count: number | null;
    max_count: number | null;
  }>();

  for (const row of tagged) {
    const limit = resolveGangCountLimit(row.count_limits, gang);
    const candidate = {
      fighter_variant: row.fighter_variant ?? null,
      cost: row.cost ?? 0,
      min_count: limit.min_count,
      max_count: limit.max_count,
    };
    const existing = representative.get(row.typeSubtypeKey);
    if (!existing) {
      representative.set(row.typeSubtypeKey, candidate);
      continue;
    }
    const candidateIsBase = !candidate.fighter_variant;
    const existingIsBase = !existing.fighter_variant;
    const prefer =
      candidateIsBase !== existingIsBase
        ? candidateIsBase
        : candidate.cost < existing.cost;
    if (prefer) representative.set(row.typeSubtypeKey, candidate);
  }

  const byTypeId = new Map<string, { min_count: number | null; max_count: number | null; typeSubtypeKey: string }>();
  for (const row of tagged) {
    const rep = representative.get(row.typeSubtypeKey);
    if (!rep) continue;
    byTypeId.set(row.id, {
      min_count: rep.min_count,
      max_count: rep.max_count,
      typeSubtypeKey: row.typeSubtypeKey,
    });
  }
  return byTypeId;
}

/** The rulebook's count in front of a name: "0-1 Stimmer", "2+ Forge-Born", or "1-3". */
export function countLimitPrefix({ min_count, max_count }: { min_count?: number | null; max_count?: number | null }): string {
  const min = min_count && min_count > 0 ? min_count : null;
  const max = max_count && max_count > 0 ? max_count : null;
  if (min && max) return `${min}-${max} `;
  if (min) return `${min}+ `;
  if (max) return `0-${max} `;
  return '';
}

/**
 * Live count against a fighter-type cap ("3-2"), a minimum-only rulebook prefix ("2+"),
 * or an em dash when the type has neither. A maximum wins when both are set: the dropdown
 * compares how many are already in the gang. `over` is true when that count reaches or exceeds the cap.
 */
export function fighterCountLimitDisplay({
  min_count,
  max_count,
  current,
}: {
  min_count?: number | null;
  max_count?: number | null;
  current: number;
}): { text: string; over: boolean } {
  const min = min_count && min_count > 0 ? min_count : null;
  const max = max_count && max_count > 0 ? max_count : null;
  if (max) return { text: `${current}-${max}`, over: current >= max };
  if (min) return { text: `${min}+`, over: false };
  return { text: '\u2014', over: false };
}
