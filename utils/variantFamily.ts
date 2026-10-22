export type VariantFamilySource = {
  fighter_type?: string | null;
  fighter_subtypes?: string[] | null;
  edition_slug?: string | null;
  fighter_variant?: string | null;
  specialisation?: { specialisation_name?: string | null } | null;
};

const subtypeKey = (row: VariantFamilySource) =>
  (row.fighter_subtypes ?? []).map(s => s.toLowerCase().trim()).sort().join(',');

const containsAllSubtypes = (subtypes: string[], base: string[]) => {
  const have = new Set(subtypes.map(s => s.toLowerCase().trim()));
  return base.every(name => have.has(name.toLowerCase().trim()));
};

// include_all_types returns every edition at once and is only narrowed to the gang's own
// edition on the client, so the edition is part of the bucket: a family never spans two.
const familyBucket = (row: VariantFamilySource) => `${row.edition_slug ?? ''}::${row.fighter_type}`;

/**
 * Tags each row with its variant family — same fighter_type, and one row's subtype set
 * containing the other's — named after the family's smallest (base) set. N26 variants can
 * add a subtype, "Master of Shadow (Leader)" next to "(Leader, Wyrd)", which an exact
 * subtype match lists as unrelated fighters. Disjoint sets stay apart, so N23's
 * "Gunner (Ganger)" and "Gunner (Specialist)" keep their own entries.
 */
export function withVariantGroups<T extends VariantFamilySource>(rows: T[]) {
  const byBucket = new Map<string, T[]>();
  for (const row of rows) {
    const group = byBucket.get(familyBucket(row));
    if (group) group.push(row);
    else byBucket.set(familyBucket(row), [row]);
  }

  const baseOfSet = new Map<string, { key: string; names: string[] }>();

  for (const [bucket, group] of byBucket) {
    const sets = new Map<string, string[]>();
    for (const row of group) {
      if (!sets.has(subtypeKey(row))) sets.set(subtypeKey(row), row.fighter_subtypes ?? []);
    }

    const bases: Array<{ key: string; names: string[] }> = [];
    const smallestFirst = [...sets].sort(([keyA, a], [keyB, b]) =>
      a.length - b.length || keyA.localeCompare(keyB)
    );

    for (const [key, names] of smallestFirst) {
      const base = bases
        .filter(candidate => containsAllSubtypes(names, candidate.names))
        .sort((a, b) => b.names.length - a.names.length)[0];
      if (!base) bases.push({ key, names });
      baseOfSet.set(`${bucket}::${key}`, base ?? { key, names });
    }
  }

  return rows.map(row => {
    const base = baseOfSet.get(`${familyBucket(row)}::${subtypeKey(row)}`)!;
    const inBase = new Set(base.names.map(name => name.toLowerCase().trim()));
    const added = (row.fighter_subtypes ?? []).filter(
      name => !inBase.has(name.toLowerCase().trim())
    );
    return {
      ...row,
      typeSubtypeKey: `${familyBucket(row)}::${base.key}`,
      variantLabel:
        row.fighter_variant || row.specialisation?.specialisation_name || added.join(', ') || 'Default',
    };
  });
}
