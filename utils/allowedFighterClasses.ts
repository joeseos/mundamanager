export const allowedFighterClasses: { [key: string]: boolean } = {
  // Core fighter classes (allowed)
  "Leader": true,
  "Champion": true,
  "Prospect": true,
  "Specialist": true,
  "Ganger": true,
  "Juve": true,
  "Crew": true,
  "Exotic Beast": true,
  "Brute": true,
  "Bounty Hunter": true,
  "Hanger-on": true,
  "Hive Scum": true,
  "House Agent": true,

};

/**
 * Utility function to filter fighter classes for custom fighter creation
 * Excludes alliance-specific fighter classes that should not be available
 * for general custom fighter creation
 */
export function filterAllowedFighterClasses<T extends { class_name: string }>(
  fighterClasses: T[]
): T[] {
  return fighterClasses.filter(fc => allowedFighterClasses[fc.class_name] === true);
}