// `tactics_cards` is the global catalogue, grouped into packs (decks) by
// `tactics_cards_packs`; the pack owns the edition, so a card derives its
// edition through `pack_id`. `gang_tactics_cards` is the per-gang row carrying
// the user's description. Kept dependency-free so client components can import
// it.

/**
 * A deck of tactics cards within one edition, with its own D66 table.
 * Picker-only: nothing on a gang points at a pack, so a gang may hold cards
 * from several.
 */
export interface TacticsCardPack {
  id: string;
  name: string;
  /** null = offered to every gang in the edition. */
  gang_type_id: string | null;
}

export interface TacticsCard {
  id: string;
  name: string;
  d66_min: number | null;
  d66_max: number | null;
  pack_id: string;
}

/**
 * GET /api/tactics-cards. Packs are ordered unrestricted-first then oldest
 * first, so `packs[0]` is the edition's Core deck without matching on its name.
 */
export interface TacticsCatalogueResponse {
  packs: TacticsCardPack[];
  cards: TacticsCard[];
}

export interface GangTacticsCard {
  /** `gang_tactics_cards.id`, not the catalogue id. */
  id: string;
  tactics_cards_id: string;
  name: string;
  d66_min: number | null;
  d66_max: number | null;
  description: string | null;
}

export const TACTICS_DESCRIPTION_CHAR_LIMIT = 1500;

/** The gang_tactics_cards select every fetcher of these rows uses. */
export const GANG_TACTICS_CARD_SELECT = `
  id,
  description,
  tactics_cards_id,
  tactics_cards:tactics_cards_id ( name, d66_min, d66_max )
`;

/** Flattens a GANG_TACTICS_CARD_SELECT row; the to-one embed may widen to an array. */
export function toGangTacticsCard(row: any): GangTacticsCard {
  const card = Array.isArray(row.tactics_cards) ? row.tactics_cards[0] : row.tactics_cards;
  return {
    id: row.id,
    tactics_cards_id: row.tactics_cards_id,
    name: card?.name ?? 'Unknown Tactic',
    d66_min: card?.d66_min ?? null,
    d66_max: card?.d66_max ?? null,
    description: row.description ?? null
  };
}

export function formatD66Range(
  min: number | null | undefined,
  max: number | null | undefined
): string {
  if (min == null || max == null) return '-';
  return min === max ? String(min) : `${min}-${max}`;
}

/** Printed card order: D66 ascending then name, with unnumbered cards last. */
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

export function normaliseTacticsDescription(
  value: string | null | undefined
): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}
