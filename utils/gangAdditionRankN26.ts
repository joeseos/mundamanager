/**
 * N26 picks gang additions by category rather than by raw fighter subtype, so
 * the category list is the source of truth and the rank map derives from it —
 * the same shape equipmentCategoryRankN26 uses. Declaration order is display
 * order in the modal and rank order everywhere else.
 *
 * `subtype` is matched against a fighter type's fighter_subtypes; `gangType`
 * is matched against `fighter_types.gang_type` when the row is not an alliance
 * crew. A category uses one or the other — Loner is a fighter subtype, not a
 * Hired Guns membership test. Optional `subcategories` become the selectable
 * combobox values under a non-selectable parent header. Pets split Generic vs
 * Dramatis Personae by whether the pet is granted with a dramatis fighter.
 * Hired Guns uses the same labels for the fighter's own dramatis flag, and
 * also lists associated pets under Dramatis Personae even when the pet's
 * gang_type is not Hired Guns.
 * Alliances are not listed here — they come from the alliances table and are
 * keyed `alliance:<id>`.
 */
export const N26_ADDITION_CATEGORIES = [
  { value: 'brute', label: 'Brutes', subtype: 'Brute' },
  { value: 'hanger-on', label: 'Hangers-on', subtype: 'Hanger-on' },
  {
    value: 'pet',
    label: 'Pets',
    subtype: 'Pet',
    subcategories: [
      { value: 'pet:generic', label: 'Generic' },
      { value: 'pet:dramatis', label: 'Dramatis Personae', associatedPet: true },
    ],
  },
  {
    value: 'hired-guns',
    label: 'Hired Guns',
    gangType: 'Hired Guns',
    subcategories: [
      { value: 'hired-guns:generic', label: 'Generic' },
      { value: 'hired-guns:dramatis', label: 'Dramatis Personae', dramatisPersonae: true },
    ],
  },
] as const;

export const N26_HIRED_GUNS_DRAMATIS_CATEGORY = 'hired-guns:dramatis';

/**
 * Empty on purpose. N26 addition order is `N26_ADDITION_CATEGORIES` declaration
 * order in the category combobox; this map is only read by N23 subtype grouping
 * via getGangAdditionRank, which N26 never uses (hasGangAdditionCategories).
 * Kept so GANG_ADDITION_RANK_BY_EDITION stays a complete Record<EditionSlug, …>.
 */
export const gangAdditionRankN26: { [key: string]: number } = {};

export type N26AdditionFighter = {
  fighter_subtypes?: string[] | null;
  alliance_id?: string | null;
  gang_type?: string | null;
  is_dramatis_personae?: boolean | null;
  is_associated_pet?: boolean | null;
};

type N26AdditionCategory = (typeof N26_ADDITION_CATEGORIES)[number];
type N26AdditionSubcategory = NonNullable<
  Extract<N26AdditionCategory, { subcategories: unknown }>['subcategories']
>[number];

const normalise = (label: string): string => label.toLowerCase().trim();

function hasFighterSubtype(type: N26AdditionFighter, subtype: string): boolean {
  return (type.fighter_subtypes ?? []).some(
    (label) => normalise(label) === normalise(subtype)
  );
}

function hasAlliance(type: N26AdditionFighter): boolean {
  return Boolean(type.alliance_id);
}

function hasGangType(type: N26AdditionFighter, gangType: string): boolean {
  return normalise(type.gang_type ?? '') === normalise(gangType);
}

function matchesDefinedCategory(
  type: N26AdditionFighter,
  category: N26AdditionCategory
): boolean {
  if ('subtype' in category && hasFighterSubtype(type, category.subtype)) return true;
  if (!('gangType' in category) || hasAlliance(type)) return false;
  return hasGangType(type, category.gangType);
}

/** Hired Guns gang-type dramatis; Generic is the rest of that parent category. */
function isHiredGunsDramatis(type: N26AdditionFighter): boolean {
  return Boolean(type.is_dramatis_personae) && hasGangType(type, 'Hired Guns');
}

function matchesSpecialSubcategory(
  type: N26AdditionFighter,
  subcategory: N26AdditionSubcategory
): boolean {
  if ('associatedPet' in subcategory && subcategory.associatedPet) {
    return Boolean(type.is_associated_pet);
  }
  if ('dramatisPersonae' in subcategory && subcategory.dramatisPersonae) {
    return isHiredGunsDramatis(type) || Boolean(type.is_associated_pet);
  }
  return false;
}

function isSpecialSubcategory(subcategory: N26AdditionSubcategory): boolean {
  return (
    ('associatedPet' in subcategory && subcategory.associatedPet) ||
    ('dramatisPersonae' in subcategory && subcategory.dramatisPersonae)
  );
}

function matchesSubcategory(
  type: N26AdditionFighter,
  category: N26AdditionCategory,
  subcategory: N26AdditionSubcategory
): boolean {
  const dramatisPersonae =
    'dramatisPersonae' in subcategory && subcategory.dramatisPersonae;
  // Skip the gang-type parent gate: associated pets belong in Hired Guns →
  // Dramatis even when their own gang_type is the pets pool.
  if (dramatisPersonae) {
    return matchesSpecialSubcategory(type, subcategory);
  }
  if (!matchesDefinedCategory(type, category)) return false;
  if (isSpecialSubcategory(subcategory)) {
    return matchesSpecialSubcategory(type, subcategory);
  }
  if (!('subcategories' in category)) return true;
  return !category.subcategories.some((sibling) =>
    matchesSpecialSubcategory(type, sibling)
  );
}

function findCategoryValue(categoryValue: string): {
  category: N26AdditionCategory;
  subcategory?: N26AdditionSubcategory;
} | null {
  for (const category of N26_ADDITION_CATEGORIES) {
    if (category.value === categoryValue) return { category };
    if (!('subcategories' in category)) continue;
    const subcategory = category.subcategories.find(
      (entry) => entry.value === categoryValue
    );
    if (subcategory) return { category, subcategory };
  }
  return null;
}

/**
 * Whether a fighter belongs in an N26 additions-category combobox value
 * (`brute`, `pet:generic`, `hired-guns:dramatis`, `misc`, `alliance:<id>`, …).
 */
export function matchesN26AdditionCategory(
  type: N26AdditionFighter,
  categoryValue: string
): boolean {
  if (categoryValue.startsWith('alliance:')) {
    return type.alliance_id === categoryValue.slice('alliance:'.length);
  }
  if (categoryValue === 'misc') {
    if (hasAlliance(type)) return false;
    return !N26_ADDITION_CATEGORIES.some((category) =>
      matchesDefinedCategory(type, category)
    );
  }
  const found = findCategoryValue(categoryValue);
  if (!found) return false;
  if (found.subcategory) return matchesSubcategory(type, found.category, found.subcategory);
  return matchesDefinedCategory(type, found.category);
}

/**
 * Custom fighters with an addition category (or an alliance) belong in the
 * additions catalog; others stay in Add Fighter.
 */
export function isCategorisedGangAddition(type: N26AdditionFighter): boolean {
  if (hasAlliance(type)) return true;
  return N26_ADDITION_CATEGORIES.some((category) =>
    matchesDefinedCategory(type, category)
  );
}
