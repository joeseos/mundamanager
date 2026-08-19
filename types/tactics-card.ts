// Gang Tactics cards. Two tables meet here: `tactics_cards` is the global,
// edition-scoped catalogue (admin-written, no rules text), and
// `gang_tactics_cards` is the per-gang row carrying the user's own description.
// They live together because the gang row denormalises the catalogue's name and
// D66 range, and both helpers below sort or format across the pair.
//
// Kept dependency-free so client components can import it.

/** A row from the global `tactics_cards` catalogue. */
export interface TacticsCard {
  id: string;
  name: string;
  d66_min: number | null;
  d66_max: number | null;
  edition_slug: string | null;
}

/** A tactics card held by a gang, flattened with its catalogue fields. */
export interface GangTacticsCard {
  /** `gang_tactics_cards.id`, not the catalogue id. */
  id: string;
  tactics_cards_id: string;
  name: string;
  d66_min: number | null;
  d66_max: number | null;
  description: string | null;
}

/** Matches the territory description limit used elsewhere in the app. */
export const TACTICS_DESCRIPTION_CHAR_LIMIT = 1500;

/** A card's D66 range as printed ("11-12"), or a dash when it has none. */
export function formatD66Range(
  min: number | null | undefined,
  max: number | null | undefined
): string {
  if (min == null || max == null) return '-';
  return min === max ? String(min) : `${min}-${max}`;
}

/**
 * Printed card order: D66 ascending, then name. Cards without a range sort
 * last, since they are supplements to a numbered deck rather than part of it.
 */
export function compareTacticsCards(
  a: Pick<TacticsCard, 'name' | 'd66_min'>,
  b: Pick<TacticsCard, 'name' | 'd66_min'>
): number {
  if (a.d66_min !== b.d66_min) {
    if (a.d66_min == null) return 1;
    if (b.d66_min == null) return -1;
    return a.d66_min - b.d66_min;
  }
  return a.name.localeCompare(b.name);
}

/** Trims a user-entered description, treating blank as absent. */
export function normaliseTacticsDescription(
  value: string | null | undefined
): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}
