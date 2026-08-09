/**
 * N26 picks gang additions by category rather than by raw fighter subtype, so
 * the category list is the source of truth and the rank map derives from it —
 * the same shape equipmentCategoryRankN26 uses. Declaration order is display
 * order in the modal and rank order everywhere else.
 *
 * `subtype` is matched against a fighter type's fighter_subtypes; `value` is
 * the combobox key. Alliances are not listed here — they come from the
 * alliances table and are keyed `alliance:<id>`.
 */
export const N26_ADDITION_CATEGORIES = [
  { value: 'brute', label: 'Brutes', subtype: 'Brute' },
  { value: 'hanger-on', label: 'Hangers-on', subtype: 'Hanger-on' },
  { value: 'pet', label: 'Pets', subtype: 'Pet' },
  { value: 'loner', label: 'Hired Guns', subtype: 'Loner' },
] as const;

export const gangAdditionRankN26: { [key: string]: number } = Object.fromEntries(
  N26_ADDITION_CATEGORIES.map((category, index) => [
    category.subtype.toLowerCase(),
    index + 1,
  ])
);
