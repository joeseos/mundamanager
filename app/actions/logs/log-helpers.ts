export function formatFinancialChanges(
  oldCredits: number,
  newCredits: number,
  oldRating: number,
  newRating: number,
  oldWealth: number,
  newWealth: number
): string {
  return `Credits: ${oldCredits} → ${newCredits} | Gang Rating: ${oldRating} → ${newRating} | Wealth: ${oldWealth} → ${newWealth}`;
}

