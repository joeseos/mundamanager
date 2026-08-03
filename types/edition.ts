// Edition slugs (never key behaviour off an edition uuid). These are the single
// source for the literals; EditionSlug derives from them.
export const EDITION_N23 = 'n23';
export const EDITION_N26 = 'n26';

export type EditionSlug = typeof EDITION_N23 | typeof EDITION_N26;

/**
 * Every edition-sensitive behaviour in the app, declared once per edition.
 *
 * No edition is "the default": a new ruleset states what it has rather than
 * inheriting silently from whichever one happened to ship first. Adding a slug
 * to EditionSlug without a full entry in EDITION_CAPABILITIES is a compile
 * error, so shipping an edition forces a decision on every flag here.
 *
 * Add a field per DECISION, not per feature. Where editions answer the same
 * question differently, that is one union-typed field, not several booleans —
 * separate booleans would admit illegal states (both on, both off). Buy
 * Equipment is the coming example: N23 governs it with Availability and N26
 * with Trade Points, which is one `equipmentResource` field, not two flags.
 */
export interface EditionCapabilities {
  /** Sv on the fighter profile */
  saveCharacteristic: boolean;
  /** A fighter may hold several classes at once */
  multipleFighterClasses: boolean;
  /** Gang-level Trade Points resource */
  tradePoints: boolean;
}

const N26_CAPABILITIES: EditionCapabilities = {
  saveCharacteristic: true,
  multipleFighterClasses: true,
  tradePoints: true,
};

/**
 * An edition that largely matches a predecessor spreads it and states only the
 * deltas, so inheritance stays explicit at the definition site instead of being
 * implied at every call site:
 *
 *   n29: { ...N26_CAPABILITIES, tradePoints: false },
 *
 * Keys must stay plain string literals. Writing them as computed keys
 * ([EDITION_N23]: …) compiles, but TypeScript stops checking the record for
 * completeness — the missing-edition error disappears and the guarantee above
 * is silently lost.
 */
const EDITION_CAPABILITIES: Record<EditionSlug, EditionCapabilities> = {
  n23: {
    saveCharacteristic: false,
    multipleFighterClasses: false,
    tradePoints: false,
  },
  n26: N26_CAPABILITIES,
};

/**
 * An unset or unrecognised slug gets nothing edition-specific. Unknown is its
 * own case, deliberately not aliased to any real edition — a missing slug means
 * the edition failed to load, and quietly serving one edition's rules would
 * hide that.
 */
const NO_CAPABILITIES: EditionCapabilities = {
  saveCharacteristic: false,
  multipleFighterClasses: false,
  tradePoints: false,
};

function capabilitiesFor(editionSlug?: string | null): EditionCapabilities {
  if (!editionSlug) return NO_CAPABILITIES;
  return EDITION_CAPABILITIES[editionSlug as EditionSlug] ?? NO_CAPABILITIES;
}

// Named per-feature predicates are the public API. Components ask what an
// edition can do; they never compare slugs themselves.
export const hasSaveCharacteristic = (editionSlug?: string | null): boolean =>
  capabilitiesFor(editionSlug).saveCharacteristic;

export const allowsMultipleClasses = (editionSlug?: string | null): boolean =>
  capabilitiesFor(editionSlug).multipleFighterClasses;

export const hasTradePoints = (editionSlug?: string | null): boolean =>
  capabilitiesFor(editionSlug).tradePoints;

export interface Edition {
  id: string;
  name: string;
  slug: string;
  is_current: boolean;
  released_at: string | null;
}
