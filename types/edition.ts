// Edition slugs components branch on (never branch on uuid)
export const EDITION_N23 = 'n23';
export const EDITION_N26 = 'n26';

/**
 * N23 is the one legacy ruleset; everything from N26 onward is "modern" and
 * differs from it in the same ways — a Save (Sv) characteristic, fighters
 * holding several classes at once, and so on.
 *
 * Gates on the legacy edition rather than on a specific new one, so future
 * editions inherit modern behaviour without a code change. An unknown/unset
 * edition is treated as legacy.
 */
export function isLegacyEdition(editionSlug?: string | null): boolean {
  return !editionSlug || editionSlug === EDITION_N23;
}

/**
 * Trade Points is a resource introduced by Necromunda (2026). Unlike Save,
 * this gates on the specific N26 edition so it does not leak into other
 * editions (past or future) unless explicitly opted in.
 */
export function hasTradePoints(editionSlug?: string | null): boolean {
  return editionSlug === EDITION_N26;
}

export interface Edition {
  id: string;
  name: string;
  slug: string;
  is_current: boolean;
  released_at: string | null;
}
