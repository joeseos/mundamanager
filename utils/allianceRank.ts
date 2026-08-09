import type { EditionSlug } from '@/types/edition';
import { allianceRankN23 } from '@/utils/allianceRankN23';
import { allianceRankN26 } from '@/utils/allianceRankN26';

/**
 * Keyed by EditionSlug so a new edition is a compile error here until it states
 * its own order, matching LIMITS_BY_EDITION and SKILL_SET_RANK_BY_EDITION.
 */
const ALLIANCE_RANK_BY_EDITION: Record<EditionSlug, { [key: string]: number }> = {
  n23: allianceRankN23,
  n26: allianceRankN26,
};

/**
 * Edition-scoped alliance sort order. An unset or unrecognised slug gets no
 * ranking, so callers fall back rather than borrowing another edition's order.
 */
export function getAllianceRank(
  editionSlug?: string | null
): { [key: string]: number } {
  if (!editionSlug) return {};
  return ALLIANCE_RANK_BY_EDITION[editionSlug as EditionSlug] ?? {};
}

/**
 * Alliance groups in display order. These are the canonical group names, not
 * the rendered headings — callers word their own headings off them, so the same
 * grouping serves both the gang edit modal ("Other Alliances") and the gang
 * additions modal ("Alliances: Other").
 */
export const ALLIANCE_TYPE_GROUPS = [
  'Criminal Organisations',
  'Merchant Guilds',
  'Noble Houses',
  'Other',
] as const;

export type AllianceTypeGroup = typeof ALLIANCE_TYPE_GROUPS[number];

/**
 * Maps the stored alliances.alliance_type onto a group. The column holds the
 * group name for every type except Criminal ("Criminal" vs "Criminal
 * Organisations") and Others, and anything unrecognised groups under Other
 * rather than inventing a heading from raw user-facing text.
 */
export function allianceTypeGroup(
  allianceType?: string | null
): AllianceTypeGroup {
  switch ((allianceType || '').trim().toLowerCase()) {
    case 'criminal':
    case 'criminal organisations':
      return 'Criminal Organisations';
    case 'merchant guilds':
      return 'Merchant Guilds';
    case 'noble houses':
      return 'Noble Houses';
    default:
      return 'Other';
  }
}

interface GroupableAlliance {
  alliance_name: string;
  alliance_type?: string | null;
}

/**
 * Groups alliances for a combobox: groups in ALLIANCE_TYPE_GROUPS order, each
 * sorted by the edition's alliance rank and then by name for anything unranked.
 * Empty groups are dropped.
 */
export function groupAlliancesByType<T extends GroupableAlliance>(
  alliances: T[],
  editionSlug?: string | null
): Array<{ group: AllianceTypeGroup; alliances: T[] }> {
  const ranks = getAllianceRank(editionSlug);

  return ALLIANCE_TYPE_GROUPS.map(group => ({
    group,
    alliances: alliances
      .filter(alliance => allianceTypeGroup(alliance.alliance_type) === group)
      .sort((a, b) => {
        const rankA = ranks[a.alliance_name.toLowerCase()] ?? Infinity;
        const rankB = ranks[b.alliance_name.toLowerCase()] ?? Infinity;
        if (rankA !== rankB) return rankA - rankB;
        return a.alliance_name.localeCompare(b.alliance_name);
      }),
  })).filter(entry => entry.alliances.length > 0);
}
