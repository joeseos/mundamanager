import type { EditionSlug } from '@/types/edition';
import { equipmentCategoryRankN23 } from '@/utils/equipmentCategoryRankN23';
import { equipmentCategoryRankN26 } from '@/utils/equipmentCategoryRankN26';

/**
 * Keyed by EditionSlug on purpose: adding an edition is a compile error here
 * until it states its own category order, the same guarantee EDITION_CAPABILITIES
 * gives for capability flags and LIMITS_BY_EDITION gives for characteristics.
 *
 * This stays out of types/edition.ts because it selects a data table rather than
 * gating a behaviour — the same split as INJURY_TABLES_BY_EDITION. The related
 * behaviour flag, whether categories group under super-categories, is a
 * capability and lives in the registry as hasEquipmentSuperCategories.
 */
const CATEGORY_RANK_BY_EDITION: Record<EditionSlug, { [key: string]: number }> = {
  n23: equipmentCategoryRankN23,
  n26: equipmentCategoryRankN26,
};

/**
 * Edition-scoped equipment category sort order.
 * An unset or unrecognised slug gets no ranking, so callers fall back to
 * alphabetical rather than borrowing another edition's order.
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
