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