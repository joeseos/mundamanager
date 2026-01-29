export function formatFinancialChanges(
  oldCredits: number,
  newCredits: number,
  oldRating: number,
  newRating: number,
  oldWealth: number,
  newWealth: number
): string {
  const creditsChanged = oldCredits !== newCredits;
  const creditsPart = creditsChanged ? `Credits: ${oldCredits} → ${newCredits} | ` : '';
  return `${creditsPart}Gang Rating: ${oldRating} → ${newRating} | Wealth: ${oldWealth} → ${newWealth}`;
}

