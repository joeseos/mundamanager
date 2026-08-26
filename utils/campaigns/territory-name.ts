/** Max length for campaign territory instance names (custom create + rename). */
export const TERRITORY_NAME_CHAR_LIMIT = 70;

export function normaliseTerritoryName(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}
