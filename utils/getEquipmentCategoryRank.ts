import type { EditionSlug } from '@/types/edition';
import { equipmentCategoryRankN23 } from '@/utils/equipmentCategoryRankN23';
import { equipmentCategoryRankN26 } from '@/utils/equipmentCategoryRankN26';

/**
 * Keyed by EditionSlug so a new edition is a compile error here, matching
 * LIMITS_BY_EDITION and INJURY_TABLES_BY_EDITION. Stays out of types/edition.ts
 * because it selects a data table rather than gating a behaviour; the related
 * flag is hasEquipmentSuperCategories in the registry.
 */
const CATEGORY_RANK_BY_EDITION: Record<EditionSlug, { [key: string]: number }> = {
  n23: equipmentCategoryRankN23,
  n26: equipmentCategoryRankN26,
};

/**
 * Edition-scoped category sort order. An unknown slug gets no ranking, so
 * callers fall back to alphabetical rather than borrowing another edition's.
 */
export function getEquipmentCategoryRank(
  editionSlug?: string | null
): { [key: string]: number } {
  if (!editionSlug) return {};
  return CATEGORY_RANK_BY_EDITION[editionSlug as EditionSlug] ?? {};
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
