import { hasCuratedFighterSubtypes } from '@/types/edition';

export const allowedFighterSubtypes: { [key: string]: boolean } = {
  // Core fighter subtypes (allowed)
  "Leader": true,
  "Champion": true,
  "Prospect": true,
  "Specialist": true,
  "Ganger": true,
  "Juve": true,
  "Crew": true,
  "Exotic Beast": true,
  "Exotic Beast Specialist": true,
  "Brute": true,
  "Bounty Hunter": true,
  "Hanger-on": true,
  "Hive Scum": true,
  "House Agent": true,
  "Beast": true,
  "Pet": true,
};

/**
 * Filters fighter subtypes for custom fighter creation, excluding the
 * alliance-specific and placeholder rows that should not be authorable.
 *
 * The shortlist above is N23's. Editions without curated subtypes offer every
 * subtype they define — the same list the admin fighter-type form uses — because
 * their tables are already all authorable traits.
 */
export function filterAllowedFighterSubtypes<T extends { subtype_name: string }>(
  fighterSubtypes: T[],
  editionSlug?: string | null
): T[] {
  if (!hasCuratedFighterSubtypes(editionSlug)) return fighterSubtypes;
  return fighterSubtypes.filter(fc => allowedFighterSubtypes[fc.subtype_name] === true);
}

/**
 * Add or remove a fighter subtype, keeping the reference list's order so the
 * stored array doesn't depend on the order the boxes happened to be ticked in.
 *
 * Shared by every form that offers the N26 multi-subtype picker (admin create,
 * admin edit, and the custom fighter form), which otherwise each carry their own
 * copy of the same four lines.
 */
export function toggleFighterSubtype(
  selected: string[],
  reference: { subtype_name: string }[],
  subtypeName: string,
  checked: boolean
): string[] {
  const next = new Set(selected);
  if (checked) next.add(subtypeName); else next.delete(subtypeName);
  return reference.map(s => s.subtype_name).filter(name => next.has(name));
}
