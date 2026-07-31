// Edition slugs components branch on (never branch on uuid)
export const EDITION_N23 = 'n23';

/**
 * Editions from N26 onward have a Save (Sv) characteristic; N23 does not.
 * Gates on the legacy edition rather than a specific new one, so future
 * editions inherit modern behaviour without a code change.
 * An unknown/unset edition is treated as legacy.
 */
export function hasSaveCharacteristic(editionSlug?: string | null): boolean {
  return !!editionSlug && editionSlug !== EDITION_N23;
}

export interface Edition {
  id: string;
  name: string;
  slug: string;
  is_current: boolean;
  released_at: string | null;
}
