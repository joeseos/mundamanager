/**
 * Patreon utility functions
 */

interface PatreonTier {
  id: string;
  name: string;
  color: string;
  order: number;
}

/**
 * Get the color for a Patreon tier based on tier ID
 * @param tierId - The Patreon tier ID
 * @returns The hex color code for the tier
 */
export const getPatreonTierColor = (tierId?: string): string => {
  if (!tierId) return '';
  
  // Tier color mapping
  const tierColors: Record<string, string> = {
    '24866273': '#3B82F6', // Underhive dweller - Blue
    '24133499': '#A855F7', // Up-hive resident - Purple
    '25945374': '#FACC15', // Helmawrs finest - Gold
  };
  
  return tierColors[tierId] || '#3B82F6'; // Default to blue for unknown tiers
};

/**
 * Get the name for a Patreon tier based on tier ID
 * @param tierId - The Patreon tier ID
 * @returns The display name for the tier
 */
const getPatreonTierName = (tierId?: string): string => {
  if (!tierId) return '';
  
  const tierNames: Record<string, string> = {
    '24866273': 'Underhive Dwellers',
    '24133499': 'Up-hive Residents',
    '25945374': "Helmawrs' Finests",
  };
  
  return tierNames[tierId] || `Tier ${tierId}`;
};

/**
 * Get all Patreon tier configurations
 * @returns Array of tier configurations ordered by tier level
 */
export const getPatreonTierConfig = (): PatreonTier[] => {
  return [
    {
      id: '24866273',
      name: getPatreonTierName('24866273'),
      color: getPatreonTierColor('24866273'),
      order: 1
    },
    {
      id: '24133499',
      name: getPatreonTierName('24133499'),
      color: getPatreonTierColor('24133499'),
      order: 2
    },
    {
      id: '25945374',
      name: getPatreonTierName('25945374'),
      color: getPatreonTierColor('25945374'),
      order: 3
    }
  ];
};
