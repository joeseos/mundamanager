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
 * Utility function to filter fighter subtypes for custom fighter creation
 * Excludes alliance-specific fighter subtypes that should not be available
 * for general custom fighter creation
 */
export function filterAllowedFighterSubtypes<T extends { subtype_name: string }>(
  fighterSubtypes: T[]
): T[] {
  return fighterSubtypes.filter(fc => allowedFighterSubtypes[fc.subtype_name] === true);
}