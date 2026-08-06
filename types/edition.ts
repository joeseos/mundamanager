// Edition slugs (never key behaviour off an edition uuid). These are the single
// source for the literals; EditionSlug derives from them.
export const EDITION_N23 = 'n23';
export const EDITION_N26 = 'n26';

export type EditionSlug = typeof EDITION_N23 | typeof EDITION_N26;

/** Null / missing edition slug is treated as N23 (legacy / unset rows). */
export function sameEditionSlug(
  a?: string | null,
  b?: string | null
): boolean {
  return (a ?? EDITION_N23) === (b ?? EDITION_N23);
}

/** Shape of an `editions:edition_id (slug)` embed. PostgREST returns a to-one
 *  embed as an object, but generated types sometimes widen it to an array, so
 *  both are accepted. */
type EditionJoin = { slug: string } | { slug: string }[] | null | undefined;

export function editionSlugFromJoin(editions: EditionJoin): string | null {
  if (!editions) return null;
  return (Array.isArray(editions) ? editions[0]?.slug : editions.slug) ?? null;
}

/**
 * Flattens a row selected with `editions:edition_id (slug)` into a plain
 * `edition_slug`, dropping the nested embed.
 *
 * Every server fetcher that returns edition-scoped rows runs its rows through
 * this, so a row carries its edition as a slug and the browser never has to
 * resolve an edition uuid (see the note at the top of this file).
 */
export function withEditionSlug<T extends Record<string, any>>(
  row: T
): T & { edition_slug: string | null } {
  const { editions, ...rest } = row;
  return { ...rest, edition_slug: editionSlugFromJoin(editions) } as T & {
    edition_slug: string | null;
  };
}

/**
 * Every edition-sensitive behaviour in the app, declared once per edition.
 *
 * No edition is "the default": a new ruleset states what it has rather than
 * inheriting silently from whichever one happened to ship first. Adding a slug
 * to EditionSlug without a full entry in EDITION_CAPABILITIES is a compile
 * error, so shipping an edition forces a decision on every flag here.
 *
 * That compile error guards the code path only. The editions table is the other
 * half of this registry and nothing keeps the two in sync, so a new edition
 * needs a migration AND an entry here — seeding the row alone leaves gangs on
 * it with every edition-specific feature switched off (capabilitiesFor warns
 * outside production when it sees a slug it does not recognise).
 *
 * Add a field per DECISION, not per feature. Where editions answer the same
 * question differently, that is one union-typed field, not several booleans —
 * separate booleans would admit illegal states (both on, both off).
 *
 * `tradePoints` is one such decision: when true, the edition uses Trade Points
 * (gang resource and equipment catalog cost); when false, equipment uses
 * Availability instead. Callers invert `hasTradePoints` for the Availability UI.
 */
export interface EditionCapabilities {
  /** Sv on the fighter profile */
  saveCharacteristic: boolean;
  /** A fighter may hold several subtypes at once */
  multipleFighterSubtypes: boolean;
  /**
   * Trade Points: gang-level resource and equipment catalog cost.
   * When false, equipment uses Availability (Trading Post rarity) instead.
   */
  tradePoints: boolean;
  /** Fighter types carry a Starting XP value (feeds N26 advancement ranks) */
  startingXp: boolean;
  /**
   * Weapon profiles use the N26 statline (SR, LR, Str, AP, Lethality) rather
   * than the N23 one (Rng S/L, Acc S/L, Str, AP, D, Am). Ammo and Damage are
   * written into Traits on N26 profiles.
   */
  lethalityStatline: boolean;
}

const N26_CAPABILITIES: EditionCapabilities = {
  saveCharacteristic: true,
  multipleFighterSubtypes: true,
  tradePoints: true,
  startingXp: true,
  lethalityStatline: true,
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
    multipleFighterSubtypes: false,
    tradePoints: false,
    startingXp: false,
    lethalityStatline: false,
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
  multipleFighterSubtypes: false,
  tradePoints: false,
  startingXp: false,
  lethalityStatline: false,
};

function capabilitiesFor(editionSlug?: string | null): EditionCapabilities {
  if (!editionSlug) return NO_CAPABILITIES;

  const capabilities = EDITION_CAPABILITIES[editionSlug as EditionSlug];
  if (!capabilities) {
    // A slug that is present but unrecognised means the editions table and this
    // registry have drifted, which the EditionSlug compile error cannot catch —
    // a migration can seed a new edition with no code change at all. Surface it
    // rather than silently hiding every edition-specific feature for that
    // ruleset. A missing slug is the separate, legitimate case handled above.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[edition] Unknown edition slug "${editionSlug}" — add it to EditionSlug and ` +
        `EDITION_CAPABILITIES. All edition-specific features are hidden for it until then.`
      );
    }
    return NO_CAPABILITIES;
  }
  return capabilities;
}

// Named per-feature predicates are the public API. Components ask what an
// edition can do; they never compare slugs themselves.
export const hasSaveCharacteristic = (editionSlug?: string | null): boolean =>
  capabilitiesFor(editionSlug).saveCharacteristic;

export const allowsMultipleSubtypes = (editionSlug?: string | null): boolean =>
  capabilitiesFor(editionSlug).multipleFighterSubtypes;

export const hasTradePoints = (editionSlug?: string | null): boolean =>
  capabilitiesFor(editionSlug).tradePoints;

export const hasStartingXp = (editionSlug?: string | null): boolean =>
  capabilitiesFor(editionSlug).startingXp;

export const hasLethalityStatline = (editionSlug?: string | null): boolean =>
  capabilitiesFor(editionSlug).lethalityStatline;

/**
 * True when two editions are known to be different.
 *
 * Null is deliberately NOT aliased to n23, for the same reason NO_CAPABILITIES
 * is not: an unknown edition is its own case, and quietly treating it as a real
 * one would hide the fact that it failed to resolve. Here that means null makes
 * no claim — it conflicts with nothing, so a guard built on this rejects only a
 * definite mismatch and never blocks a user over data it could not read.
 */
export const editionsConflict = (
  a?: string | null,
  b?: string | null
): boolean => a != null && b != null && a !== b;

export interface Edition {
  id: string;
  name: string;
  slug: string;
  is_current: boolean;
  released_at: string | null;
}
