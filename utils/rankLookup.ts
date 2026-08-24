/**
 * Shared lookups over the edition-scoped rank tables in this folder
 * (fighterSubtypeRankN*, gangAdditionRankN*, allianceRankN*).
 *
 * A row can carry several labels at once — N26 allows multiple fighter subtypes
 * — so ranking one means scanning every label and keeping the best (lowest)
 * recognised rank, rather than trusting labels[0]. Without this a fighter typed
 * ["Pious", "Prospect"] sorts by "Pious" (unranked) and lands at the bottom.
 */

/** Rank tables are keyed by the lowercased, trimmed label. */
const normalise = (label: string): string => label.toLowerCase().trim();

/**
 * Best (lowest) recognised rank across every label, or Infinity when none of
 * them appear in the table.
 */
export function bestRank(
  labels: string[] | null | undefined,
  ranks: { [key: string]: number }
): number {
  return bestRankedLabel(labels, ranks).rank;
}

/**
 * As bestRank, but also returns the label that won. Falls back to the first
 * label so callers that group by name still have something to show when
 * nothing is ranked.
 */
export function bestRankedLabel(
  labels: string[] | null | undefined,
  ranks: { [key: string]: number }
): { label: string; rank: number } {
  let bestLabel = labels?.[0] || '';
  let best = Infinity;
  for (const label of labels ?? []) {
    const rank = ranks[normalise(label)];
    if (rank !== undefined && rank < best) {
      best = rank;
      bestLabel = label;
    }
  }
  return { label: bestLabel, rank: best };
}
