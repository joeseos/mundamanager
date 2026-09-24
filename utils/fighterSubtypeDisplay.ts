import { emptyFighterSubtypeLabel } from '@/types/edition';

/**
 * Subtype names as shown next to a fighter. A list with names is joined.
 * An empty list is shown as `*` on every edition.
 */
export function formatFighterSubtypeDisplay(
  subtypes: readonly string[] | null | undefined,
  editionSlug?: string | null,
): string {
  const names = (subtypes ?? []).map((name) => name.trim()).filter(Boolean);
  if (names.length > 0) return names.join(', ');
  return emptyFighterSubtypeLabel(editionSlug);
}
