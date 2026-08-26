/** Max length for campaign territory instance names (custom create + rename). */
export const TERRITORY_NAME_CHAR_LIMIT = 70;

export function normaliseTerritoryName(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Validate a territory name (already normalised / trimmed).
 * @returns error message, or null when valid
 */
export function validateTerritoryName(normalisedName: string): string | null {
  if (!normalisedName) {
    return 'Territory name is required';
  }
  if (normalisedName.length > TERRITORY_NAME_CHAR_LIMIT) {
    return `Territory name must be ${TERRITORY_NAME_CHAR_LIMIT} characters or less`;
  }
  return null;
}
