// Edition slugs (never key behaviour off an edition uuid). These are the single
// source for the literals; EditionSlug derives from them.
export const EDITION_N23 = 'n23';
export const EDITION_N26 = 'n26';

export type EditionSlug = typeof EDITION_N23 | typeof EDITION_N26;

/**
 * True when two editions should be shown together. A missing slug counts as N23:
 * legacy rows predate edition_id. Filtering only — to gate an action use
 * editionsConflict, which does not read an unresolved edition as N23.
 */
export function sameEditionForDisplay(
  a?: string | null,
  b?: string | null
): boolean {
  return (a ?? EDITION_N23) === (b ?? EDITION_N23);
}

/**
 * True when two editions are known to be different. Null makes no claim, so a
 * guard built on this rejects a definite mismatch and never blocks a user over
 * an edition that failed to resolve.
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
 * The `editions` embed from whichever gang type applies. Gangs have no
 * edition_id of their own. Accepts every custom-gang-type alias in use, since
 * callers spell it differently depending on what else their query selects.
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
 * Every edition-sensitive behaviour, one row per decision. Adding a slug to
 * EditionSlug is one compile error per row, so a new edition answers each
 * question on its own. Two behaviours that split the editions the same way today
 * still get two rows.
 *
 * Keyed by capability, not by edition: a per-edition object could be cloned
 * (`{ ...N26, tradePoints: false }`), which silently inherits every capability
 * added afterwards. Inner keys must stay plain string literals — computed keys
 * compile but switch off the completeness check.
 *
 * Values are boolean. A decision with more than two answers needs the constraint
 * widened to `unknown` and its own accessor; nothing needs that yet.
 *
 * Covers the code path only: the editions table is the other half and nothing
 * keeps them in sync, so a new edition needs a migration AND rows here.
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

// Once per unrecognised slug, not once per lookup.
const warnedSlugs = new Set<string>();

function can(
  capability: EditionCapability,
  editionSlug?: string | null
): boolean {
  // Missing slug: nothing edition-specific applies, and it is not drift, so it
  // stays quiet. An unrecognised slug below is drift, and warns.
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

// The public API. Callers ask what an edition can do rather than comparing
// slugs, and never reuse one predicate to gate an unrelated rule.
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
