import { EDITION_N23, EDITION_N26 } from '@/types/edition';
import { equipmentCategoryRankN23 } from '@/utils/equipmentCategoryRankN23';
import { equipmentCategoryRankN26 } from '@/utils/equipmentCategoryRankN26';

/**
 * Edition-scoped equipment category sort order.
 * N23 and N26 each have their own ranking; unknown/missing editions get none.
 */
export function getEquipmentCategoryRank(
  editionSlug?: string | null
): { [key: string]: number } {
  if (editionSlug === EDITION_N26) return equipmentCategoryRankN26;
  if (editionSlug === EDITION_N23) return equipmentCategoryRankN23;
  return {};
}

/** N26 groups categories under UI-only super-categories in the Equipment modal. */
export function hasEquipmentSuperCategories(editionSlug?: string | null): boolean {
  return editionSlug === EDITION_N26;
}

export function compareEquipmentCategories(
  a: string,
  b: string,
  editionSlug?: string | null
): number {
  const ranks = getEquipmentCategoryRank(editionSlug);
  const rankA = ranks[a.toLowerCase()];
  const rankB = ranks[b.toLowerCase()];

  if (rankA === undefined && rankB === undefined) {
    return a.localeCompare(b);
  }
  if (rankA === undefined) return 1;
  if (rankB === undefined) return -1;
  if (rankA !== rankB) return rankA - rankB;
  return a.localeCompare(b);
}
