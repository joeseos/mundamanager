import React, { useMemo, useEffect } from 'react';
import FighterCard from './fighter-card';
import { FighterProps } from '@/types/fighter';
import { calculateAdjustedStats } from '@/utils/stats';

// Add interface definition for MyFightersProps
interface MyFightersProps {
  fighters: FighterProps[];
  isLoading?: boolean;
  error?: string;
}

// Optimize image URL with Cloudinary transformations
const BACKGROUND_IMAGE_URL = "https://res.cloudinary.com/dle0tkpbl/image/upload/f_auto,q_auto:good,w_800,c_limit/v1732964932/light-texture-bg-sm_wqttn8.jpg";

// Add proper image sizes
const imageSizes = {
  mobile: '100vw',
  tablet: '50vw',
  desktop: '800px'
};

export function MyFighters({ fighters, isLoading, error }: MyFightersProps) {
  const memoizedFormatters = useMemo(() => ({
    getSortedWargear: (wargear: any[]) => 
      wargear
        .sort((a, b) => a.wargear_name.localeCompare(b.wargear_name))
        .map(item => item.wargear_name)
        .join(', '),
    
    getStatsData: (fighter: FighterProps) => {
      const adjustedStats = calculateAdjustedStats(fighter);
      
      return {
        'M': `${adjustedStats.movement}"`,
        'WS': `${adjustedStats.weapon_skill}+`,
        'BS': adjustedStats.ballistic_skill === 0 ? '-' : `${adjustedStats.ballistic_skill}+`,
        'S': adjustedStats.strength,
        'T': adjustedStats.toughness,
        'W': adjustedStats.wounds,
        'I': `${adjustedStats.initiative}+`,
        'A': adjustedStats.attacks,
        'Ld': `${adjustedStats.leadership}+`,
        'Cl': `${adjustedStats.cool}+`,
        'Wil': `${adjustedStats.willpower}+`,
        'Int': `${adjustedStats.intelligence}+`,
        'XP': fighter.xp
      };
    }
  }), []);

  useEffect(() => {
    console.log('Fighters data in MyFighters:', fighters);
  }, [fighters]);

  const imageProps = useMemo(() => ({
    src: BACKGROUND_IMAGE_URL,
    alt: "Background texture",
    fill: true,
    className: "object-cover z-0",
    sizes: `(max-width: 640px) ${imageSizes.mobile}, (max-width: 1024px) ${imageSizes.tablet}, ${imageSizes.desktop}`,
    quality: 75,
    onError: (e: any) => {
      const target = e.target as HTMLElement;
      target.style.backgroundColor = '#f3f4f6';
    }
  }), []);

  const sortedFighters = useMemo(() => {
    return [...fighters].sort((a, b) => {
      // Helper function to get fighter status priority (higher number = lower in list)
      const getStatusPriority = (fighter: FighterProps) => {
        if (fighter.killed) return 3;
        if (fighter.starved || fighter.enslaved) return 2;
        if (fighter.retired) return 1;
        return 0;
      };

      const statusA = getStatusPriority(a);
      const statusB = getStatusPriority(b);

      // First sort by status
      if (statusA !== statusB) {
        return statusA - statusB;
      }
      // Then by name if status is the same
      return a.fighter_name.localeCompare(b.fighter_name);
    });
  }, [fighters]);

  // Filter out any invalid fighters
  const validFighters = fighters.filter(fighter => 
    fighter && fighter.id && fighter.fighter_name && fighter.fighter_type
  );

  if (isLoading) {
    return <div className="animate-pulse">Loading fighters...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error: {error}</div>;
  }

  if (!fighters || fighters.length === 0) {
    return <p className="text-gray-500 italic">No fighters available.</p>;
  }

  return (
    <div className="flex flex-col space-y-4 w-full print:flex print:flex-wrap print:flex-row print:space-y-0">
      {sortedFighters.map((fighter) => {
        const {
          id,
          fighter_name,
          fighter_type,
          fighter_class,
          free_skill,
          kills = 0,
          vehicles = [], // Extract vehicles from fighter
          ...otherProps
        } = fighter;

        // Get the first vehicle if it exists
        const vehicle = vehicles && vehicles.length > 0 ? vehicles[0] : undefined;

        return (
          <FighterCard
            key={id}
            id={id}
            name={fighter_name}
            type={fighter_type}
            fighter_class={fighter_class}
            free_skill={free_skill}
            kills={kills}
            vehicle={vehicle}
            {...otherProps}
          />
        );
      })}
    </div>
  );
}
