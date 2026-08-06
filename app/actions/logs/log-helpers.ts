import { XP_CASES } from '@/utils/xpCases';

/**
 * XP case id → display label / XP each, derived from the single award registry
 * in utils/xpCases.ts.
 *
 * Deliberately typed Record<string, …> rather than Record<XpCaseId, …>: these
 * are indexed with ids read back from persisted log payloads, which may predate
 * the union or outlive an award being retired from every edition's list. Both
 * lookups below fall back rather than assuming a hit.
 */
export const XP_CASE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(XP_CASES).map(([id, def]) => [id, def.label])
);

export const XP_CASE_VALUES: Record<string, number> = Object.fromEntries(
  Object.entries(XP_CASES).map(([id, def]) => [id, def.xp])
);

export function formatXpBreakdown(breakdown: Record<string, number>, miscNote?: string): string {
  return Object.entries(breakdown)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => {
      const label = XP_CASE_LABELS[id] || id;
      const xpPer = XP_CASE_VALUES[id] ?? 1;
      const xp = count * xpPer;
      const labelWithNote = id === 'misc' && miscNote
        ? `${label}: ${miscNote}`
        : label;
      return `${xp} for ${labelWithNote}`;
    })
    .join(', ');
}

export function formatFinancialChanges(
  oldCredits: number,
  newCredits: number,
  oldRating: number,
  newRating: number,
  oldWealth: number,
  newWealth: number
): string {
  const parts: string[] = [];

  if (oldCredits !== newCredits) {
    parts.push(`Credits: ${oldCredits} → ${newCredits}`);
  }
  if (oldRating !== newRating) {
    parts.push(`Gang Rating: ${oldRating} → ${newRating}`);
  }
  if (oldWealth !== newWealth) {
    parts.push(`Wealth: ${oldWealth} → ${newWealth}`);
  }

  return parts.join(' | ');
}

