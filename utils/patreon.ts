/**
 * Patreon utility functions
 */

/**
 * Get the color for a Patreon tier based on tier ID
 * @param tierId - The Patreon tier ID (1, 2, 3, etc.)
 * @returns The hex color code for the tier
 */
export const getPatreonTierColor = (tierId?: string): string => {
  if (!tierId) return '';
  
  // Map tier IDs to colors based on specifications
  switch (tierId) {
    case '1':
      return '#3B82F6'; // Blue for Tier 1
    case '2':
      return '#A855F7'; // Purple for Tier 2
    case '3':
      return '#FACC15'; // Gold for Tier 3
    default:
      return '#3B82F6'; // Default to blue for unknown tiers
  }
};
