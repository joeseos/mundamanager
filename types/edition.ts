// Edition slugs components branch on (never branch on uuid)
export const EDITION_N23 = 'n23';

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

export interface Edition {
  id: string;
  name: string;
  slug: string;
  is_current: boolean;
  released_at: string | null;
}
