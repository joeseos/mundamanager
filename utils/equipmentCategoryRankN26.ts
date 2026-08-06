/**
 * N26 equipment category order and UI-only super-category grouping.
 * Super-categories are not stored in the database.
 *
 * Keep this list in sync with `equipment_categories` rows for the N26 edition.
 * A category missing here still appears in the UI, but sorts to the end with no
 * super-category header (see compareEquipmentCategories fallback).
 */

export interface EquipmentCategoryN26Entry {
  category_name: string;
  super_category_name: string;
}

export const equipmentCategoriesN26: EquipmentCategoryN26Entry[] = [
  { category_name: "Aranthian Weapons (Close Combat Weapons)", super_category_name: "Close Combat Weapons" },
  { category_name: "Augmetic Weapons (Close Combat Weapons)", super_category_name: "Close Combat Weapons" },
  { category_name: "Cawdor Polearms", super_category_name: "Close Combat Weapons" },
  { category_name: "Chain Weapons", super_category_name: "Close Combat Weapons" },
  { category_name: "Esoteric Weapons (Close Combat Weapons)", super_category_name: "Close Combat Weapons" },
  { category_name: "Exo Weapons (Close Combat Weapons)", super_category_name: "Close Combat Weapons" },
  { category_name: "Extra Arm", super_category_name: "Close Combat Weapons" },
  { category_name: "Hand Weapons", super_category_name: "Close Combat Weapons" },
  { category_name: "Justicar Weapons (Close Combat Weapons)", super_category_name: "Close Combat Weapons" },
  { category_name: "Lances", super_category_name: "Close Combat Weapons" },
  { category_name: "Mutation", super_category_name: "Close Combat Weapons" },
  { category_name: "Natural Weapons (Close Combat Weapons)", super_category_name: "Close Combat Weapons" },
  { category_name: "Nomad Weapons", super_category_name: "Close Combat Weapons" },
  { category_name: "Power Pack (Close Combat Weapons)", super_category_name: "Close Combat Weapons" },
  { category_name: "Power Weapons", super_category_name: "Close Combat Weapons" },
  { category_name: "Primitive Weapons (Close Combat Weapons)", super_category_name: "Close Combat Weapons" },
  { category_name: "Repurposed Tools (Close Combat Weapons)", super_category_name: "Close Combat Weapons" },
  { category_name: "Shields", super_category_name: "Close Combat Weapons" },
  { category_name: "Shock Weapons", super_category_name: "Close Combat Weapons" },
  { category_name: "Sthenian Weapons (Close Combat Weapons)", super_category_name: "Close Combat Weapons" },
  { category_name: "Subjugator Weapons (Close Combat Weapons)", super_category_name: "Close Combat Weapons" },
  { category_name: "Toxin Weapons (Close Combat Weapons)", super_category_name: "Close Combat Weapons" },
  { category_name: "Vehicle Weapons", super_category_name: "Close Combat Weapons" },
  { category_name: "Web Weapons (Close Combat Weapons)", super_category_name: "Close Combat Weapons" },
  { category_name: "Aranthian Weapons (Ranged Weapons)", super_category_name: "Ranged Weapons" },
  { category_name: "Augmetic Weapons (Ranged Weapons)", super_category_name: "Ranged Weapons" },
  { category_name: "Auto/Stub Weapons", super_category_name: "Ranged Weapons" },
  { category_name: "Auxiliary Weapons", super_category_name: "Ranged Weapons" },
  { category_name: "Blast Weapons", super_category_name: "Ranged Weapons" },
  { category_name: "Bolt Weapons", super_category_name: "Ranged Weapons" },
  { category_name: "Combi-Pistols", super_category_name: "Ranged Weapons" },
  { category_name: "Combi-Weapons", super_category_name: "Ranged Weapons" },
  { category_name: "Esoteric Weapons (Ranged Weapons)", super_category_name: "Ranged Weapons" },
  { category_name: "Exo Weapons (Ranged Weapons)", super_category_name: "Ranged Weapons" },
  { category_name: "Flamers", super_category_name: "Ranged Weapons" },
  { category_name: "Grav Weapons", super_category_name: "Ranged Weapons" },
  { category_name: "Grenade Launchers", super_category_name: "Ranged Weapons" },
  { category_name: "Grenades", super_category_name: "Ranged Weapons" },
  { category_name: "Justicar Weapons (Ranged Weapons)", super_category_name: "Ranged Weapons" },
  { category_name: "Las Weapons", super_category_name: "Ranged Weapons" },
  { category_name: "Melta Weapons", super_category_name: "Ranged Weapons" },
  { category_name: "Natural Weapons (Ranged Weapons)", super_category_name: "Ranged Weapons" },
  { category_name: "Plasma Weapons", super_category_name: "Ranged Weapons" },
  { category_name: "Power Pack (Ranged Weapons)", super_category_name: "Ranged Weapons" },
  { category_name: "Primitive Weapons (Ranged Weapons)", super_category_name: "Ranged Weapons" },
  { category_name: "Radiation Weapons", super_category_name: "Ranged Weapons" },
  { category_name: "Repurposed Tools (Ranged Weapons)", super_category_name: "Ranged Weapons" },
  { category_name: "Shotguns", super_category_name: "Ranged Weapons" },
  { category_name: "Sthenian Weapons (Ranged Weapons)", super_category_name: "Ranged Weapons" },
  { category_name: "Subjugator Weapons (Ranged Weapons)", super_category_name: "Ranged Weapons" },
  { category_name: "Toxin Weapons (Ranged Weapons)", super_category_name: "Ranged Weapons" },
  { category_name: "Web Weapons (Ranged Weapons)", super_category_name: "Ranged Weapons" },
  { category_name: "Hunt Master Weapons", super_category_name: "Spyrer Weapons" },
  { category_name: "Jakara Weapons", super_category_name: "Spyrer Weapons" },
  { category_name: "Malcadon Weapons", super_category_name: "Spyrer Weapons" },
  { category_name: "Orrus Close Combat Weapons", super_category_name: "Spyrer Weapons" },
  { category_name: "Orrus Ranged Weapons", super_category_name: "Spyrer Weapons" },
  { category_name: "Yeld Weapons", super_category_name: "Spyrer Weapons" },
  { category_name: "Armour & Field Armour", super_category_name: "Wargear" },
  { category_name: "Gang Equipment", super_category_name: "Wargear" },
  { category_name: "Personal Equipment", super_category_name: "Wargear" },
  { category_name: "Ridgehauler Upgrades", super_category_name: "Wargear" },
  { category_name: "Mounts", super_category_name: "Wargear" },
  { category_name: "Pets", super_category_name: "Wargear" },
  { category_name: "Weapon Accessories", super_category_name: "Wargear" },
];

/** Category sort order keyed by lowercased category_name. */
export const equipmentCategoryRankN26: { [key: string]: number } = Object.fromEntries(
  equipmentCategoriesN26.map((entry, index) => [entry.category_name.toLowerCase(), index])
);

/** Super-category sort order keyed by lowercased super_category_name. */
export const equipmentSuperCategoryRankN26: { [key: string]: number } = (() => {
  const ranks: { [key: string]: number } = {};
  let nextRank = 0;
  for (const entry of equipmentCategoriesN26) {
    const key = entry.super_category_name.toLowerCase();
    if (ranks[key] === undefined) {
      ranks[key] = nextRank++;
    }
  }
  return ranks;
})();

/** Maps lowercased category_name → super_category_name (original casing). */
export const equipmentCategoryToSuperCategoryN26: { [key: string]: string } = Object.fromEntries(
  equipmentCategoriesN26.map((entry) => [
    entry.category_name.toLowerCase(),
    entry.super_category_name,
  ])
);

/**
 * Display-only: strip parenthetical weapon-type suffixes from N26 category names.
 * Does not change the underlying database category_name values.
 */
export function getEquipmentCategoryDisplayNameN26(categoryName: string): string {
  return categoryName
    .replace(/ \(Close Combat Weapons\)$/, '')
    .replace(/ \(Ranged Weapons\)$/, '');
}

export function getEquipmentSuperCategoryN26(categoryName: string): string | undefined {
  return equipmentCategoryToSuperCategoryN26[categoryName.toLowerCase()];
}
