// Edition slugs (never key behaviour off an edition uuid). These are the single
// source for the literals; EditionSlug derives from them.
export const EDITION_N23 = 'n23';
export const EDITION_N26 = 'n26';

export type EditionSlug = typeof EDITION_N23 | typeof EDITION_N26;

/**
 * Comparing two editions has two different right answers for a missing slug, so
 * there are two functions. Pick by what you are doing:
 *
 *   filtering a list for display  → sameEditionForDisplay (null counts as N23)
 *   guarding a user action        → editionsConflict      (null claims nothing)
 *
 * They agree on everything except (null, 'n26'), where the first says "different"
 * and the second says "no conflict". Reaching for the wrong one means either
 * hiding legacy rows from the N23 list, or rejecting a user over data that simply
 * failed to resolve.
 */

/**
 * True when two editions should be shown together. A missing slug counts as N23,
 * because legacy rows predate edition_id and belong under the legacy ruleset.
 * Do not use this to gate an action — see editionsConflict.
 */
export function sameEditionForDisplay(
  a?: string | null,
  b?: string | null
): boolean {
  return (a ?? EDITION_N23) === (b ?? EDITION_N23);
}

/**
 * True when two editions are known to be different.
 *
 * Null is deliberately NOT aliased to n23, for the same reason an unrecognised
 * slug gets no capabilities: an unknown edition is its own case, and quietly
 * treating it as a real one would hide the fact that it failed to resolve. Here
 * that means null makes no claim — it conflicts with nothing, so a guard built on
 * this rejects only a definite mismatch and never blocks a user over data it
 * could not read.
 */
export const editionsConflict = (
  a?: string | null,
  b?: string | null
): boolean => a != null && b != null && a !== b;

/** An `editions:edition_id (…)` embed. PostgREST returns a to-one embed as an
 *  object, but generated types sometimes widen it to an array. */
type EditionJoin = { slug: string } | { slug: string }[] | null | undefined;

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

export function editionSlugFromJoin(editions: EditionJoin): string | null {
  return firstOf(editions)?.slug ?? null;
}

/**
 * Flattens an `editions:edition_id (slug)` embed into a plain `edition_slug`.
 * Every server fetcher of edition-scoped rows runs its rows through this, so
 * the browser never has to resolve an edition uuid.
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
 * The `editions` embed from whichever gang type applies, official or custom.
 * Gangs have no edition_id of their own — it is always derived via the type.
 *
 * Callers alias the custom-gang-type embed differently depending on what else
 * their query selects, so every spelling in use is accepted here rather than
 * being re-derived (and mis-spelled) at each call site.
 */
export function gangEditionJoin(
  gang: any
): { id?: string; slug?: string } | null {
  if (!gang) return null;
  const aliases = [
    'gang_types',
    'custom_gang_types',
    'custom_gang_type',
    'custom_gang_type_edition',
  ];
  for (const alias of aliases) {
    const editions = firstOf(firstOf<any>(gang[alias])?.editions);
    if (editions) return editions;
  }
  return null;
}

/** A gang's edition slug, derived via its gang type. */
export function gangEditionSlug(gang: any): string | null {
  return gangEditionJoin(gang)?.slug ?? null;
}

/**
 * Every edition-sensitive behaviour in the app, one row per decision.
 *
 * No edition is "the default": a ruleset states what it has rather than
 * inheriting from whichever one happened to ship first. Adding a slug to
 * EditionSlug produces one compile error per row here, so a new edition has to
 * answer every question individually.
 *
 * Keyed by capability rather than by edition on purpose. The other transpose —
 * one object per edition — invites `n29: { ...N26_CAPABILITIES, tradePoints:
 * false }`, which compiles happily and silently gives n29 N26's answer for every
 * capability added later. There is no per-edition object here, so that shortcut
 * does not exist.
 *
 * Two rules for adding a row:
 *
 *  - One row per DECISION, not per feature. Two behaviours that happen to split
 *    the editions the same way today still get two rows, or the next edition
 *    decides both by accident. Where a decision has more than two answers the row
 *    holds a union rather than a boolean; `as const` keeps the literal types.
 *  - Ask whether it belongs here at all. "Does this ruleset have a Save
 *    characteristic" is edition-level. "Can this particular weapon be
 *    master-crafted" is a property of the equipment row.
 *
 * Inner keys must stay plain string literals. Written as computed keys
 * ([EDITION_N23]: …) it still compiles, but TypeScript stops checking the record
 * for completeness and the guarantee above is silently gone.
 *
 * This registry covers the code path only. The editions table is its other half
 * and nothing keeps the two in sync, so a new edition needs a migration AND rows
 * here — seeding the row alone leaves gangs on it with every edition-specific
 * feature switched off (`can` warns outside production when it sees a slug it
 * does not recognise).
 */
const EDITION_CAPABILITIES = {
  /** Sv on the fighter profile */
  saveCharacteristic:       { n23: false, n26: true  },
  /** A fighter may hold several subtypes at once */
  multipleFighterSubtypes:  { n23: false, n26: true  },
  /**
   * Trade Points: gang-level resource and equipment catalog cost.
   * When false, equipment uses Availability (Trading Post rarity) instead.
   */
  tradePoints:              { n23: false, n26: true  },
  /** Fighter types carry a Starting XP value (feeds N26 advancement ranks) */
  startingXp:               { n23: false, n26: true  },
  /**
   * Weapon profiles use the N26 statline (SR, LR, Str, AP, Lethality) rather
   * than the N23 one (Rng S/L, Acc S/L, Str, AP, D, Am). Ammo and Damage are
   * written into Traits on N26 profiles.
   */
  lethalityStatline:        { n23: false, n26: true  },
  /** Fighter types can be vehicles */
  vehicles:                 { n23: false, n26: true  },
  /** Equipment categories group under UI-only super-categories in the modal */
  equipmentSuperCategories: { n23: false, n26: true  },
  /** Weapons can be bought master-crafted, at a higher rating cost */
  masterCraftedWeapons:     { n23: true,  n26: false },
} as const satisfies Record<string, Record<EditionSlug, boolean>>;

export type EditionCapability = keyof typeof EDITION_CAPABILITIES;

// One warning per unrecognised slug, not one per lookup — a single unknown
// edition would otherwise log on every predicate call on every render.
const warnedSlugs = new Set<string>();

function can(
  capability: EditionCapability,
  editionSlug?: string | null
): boolean {
  // A missing slug is its own case: the edition failed to resolve, or the row
  // predates editions entirely. Nothing edition-specific applies, and it is not
  // a drift signal, so it stays quiet.
  if (!editionSlug) return false;

  const answers = EDITION_CAPABILITIES[capability] as Readonly<
    Record<string, boolean | undefined>
  >;
  const answer = answers[editionSlug];

  if (answer === undefined) {
    if (process.env.NODE_ENV !== 'production' && !warnedSlugs.has(editionSlug)) {
      warnedSlugs.add(editionSlug);
      console.warn(
        `[edition] Unknown edition slug "${editionSlug}" — add it to EditionSlug ` +
        `and answer every row in EDITION_CAPABILITIES. Until then all ` +
        `edition-specific features are switched off for it.`
      );
    }
    return false;
  }
  return answer;
}

// Named per-capability predicates are the public API. Components ask what an
// edition can do; they never compare slugs, and they never reuse one predicate
// to gate an unrelated rule — two rules that agree today still need two rows.
export const hasSaveCharacteristic = (editionSlug?: string | null): boolean =>
  can('saveCharacteristic', editionSlug);

export const allowsMultipleSubtypes = (editionSlug?: string | null): boolean =>
  can('multipleFighterSubtypes', editionSlug);

export const hasTradePoints = (editionSlug?: string | null): boolean =>
  can('tradePoints', editionSlug);

export const hasStartingXp = (editionSlug?: string | null): boolean =>
  can('startingXp', editionSlug);

export const hasLethalityStatline = (editionSlug?: string | null): boolean =>
  can('lethalityStatline', editionSlug);

export const hasVehicles = (editionSlug?: string | null): boolean =>
  can('vehicles', editionSlug);

export const hasEquipmentSuperCategories = (
  editionSlug?: string | null
): boolean => can('equipmentSuperCategories', editionSlug);

export const hasMasterCraftedWeapons = (editionSlug?: string | null): boolean =>
  can('masterCraftedWeapons', editionSlug);

export interface Edition {
  id: string;
  name: string;
  slug: string;
  is_current: boolean;
  released_at: string | null;
}
