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

