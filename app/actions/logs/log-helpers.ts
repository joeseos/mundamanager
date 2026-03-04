/** XP case id → display label (must match fighter-xp-modal xpCountCases) */
export const XP_CASE_LABELS: Record<string, string> = {
  seriousInjury: 'Cause Serious Injury',
  outOfAction: 'Cause OOA',
  leaderChampionBonus: 'Leader/Champion',
  vehicleWrecked: 'Wreck Vehicle',
  rally: 'Successful Rally',
  assistance: 'Provide Assistance',
  misc: 'Misc.',
  battleParticipation: 'Battle Participation',
};

/** XP per case (id → XP each) - must match fighter-xp-modal */
export const XP_CASE_VALUES: Record<string, number> = {
  seriousInjury: 1,
  outOfAction: 2,
  leaderChampionBonus: 1,
  vehicleWrecked: 2,
  rally: 1,
  assistance: 1,
  misc: 1,
  battleParticipation: 1,
};

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

