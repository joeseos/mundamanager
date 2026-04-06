/** Sentinel value for Combobox when no playing card is selected */
export const TERRITORY_PLAYING_CARD_NONE = '__none__';

/** Sentinel for "Custom" mode: value is entered in a separate text field */
export const TERRITORY_PLAYING_CARD_CUSTOM = '__custom__';

/** Rank order for sorting and combobox generation */
export const CARD_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
/** Suit order: matches combobox generation (suit major, then rank) */
export const CARD_SUITS = ['♦️', '♠️', '♥️', '♣️'];

export const territoryPlayingCardComboboxOptions = [
  { value: TERRITORY_PLAYING_CARD_NONE, label: 'None' },
  ...CARD_SUITS.flatMap((suit) =>
    CARD_RANKS.map((rank) => ({
      value: `${rank}${suit}`,
      label: `${rank}${suit}`
    }))
  )
];

/** None, Custom, then standard deck — used in Edit Territory (no free-text in the combobox) */
export const territoryPlayingCardEditOptions = [
  territoryPlayingCardComboboxOptions[0],
  { value: TERRITORY_PLAYING_CARD_CUSTOM, label: 'Custom' },
  ...territoryPlayingCardComboboxOptions.slice(1)
];

/**
 * Parses a value like `10♦️` using {@link CARD_RANKS} and {@link CARD_SUITS}.
 * Returns null if it does not match the standard rank+suit pattern.
 */
export function parseStandardPlayingCard(value: string): { suitIndex: number; rankIndex: number } | null {
  const v = value.trim();
  if (!v) return null;
  for (let si = 0; si < CARD_SUITS.length; si++) {
    const suit = CARD_SUITS[si];
    if (!v.endsWith(suit)) continue;
    const rankPart = v.slice(0, v.length - suit.length);
    const ri = CARD_RANKS.indexOf(rankPart);
    if (ri >= 0) return { suitIndex: si, rankIndex: ri };
  }
  return null;
}

/**
 * Stable string key for sorting: standard cards (suit major, then rank), then non-standard values, then empty.
 */
export function getPlayingCardSortKey(playing_card: string | null | undefined): string {
  const parsed = parseStandardPlayingCard(playing_card ?? '');
  if (parsed) {
    return `0${String(parsed.suitIndex).padStart(2, '0')}${String(parsed.rankIndex).padStart(2, '0')}`;
  }
  const t = typeof playing_card === 'string' ? playing_card.trim() : '';
  if (!t) return '2';
  return `1${t}`;
}
