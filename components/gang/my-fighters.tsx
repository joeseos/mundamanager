import React, { useMemo, useEffect } from 'react';
import FighterCard from './fighter-card';
import { FighterProps } from '@/types/fighter';
import { calculateAdjustedStats } from '@/utils/stats';
import { SortableFighter } from './sortable-fighter';
import { fighterClassRank } from '@/utils/fighterClassRank';

// Add interface definition for MyFightersProps
interface MyFightersProps {
  fighters: FighterProps[];
  isLoading?: boolean;
  error?: string;
  positions: Record<number, string>;
  viewMode?: 'normal' | 'small' | 'medium' | 'large';
}


// Optimize image URL with Cloudinary transformations
const BACKGROUND_IMAGE_URL = "https://res.cloudinary.com/dle0tkpbl/image/upload/f_auto,q_auto:good,w_800,c_limit/v1732964932/light-texture-bg-sm_wqttn8.jpg";

// Add proper image sizes
const imageSizes = {
  mobile: '100vw',
  tablet: '50vw',
  desktop: '800px'
};

export function MyFighters({ fighters, positions, isLoading, error, viewMode = 'normal' }: MyFightersProps) {
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
    // Create a position-based ordering using the positions object directly
    const positionMap: Record<string, number> = {};
    
    // First, create a mapping of fighter IDs to their positions
    Object.entries(positions).forEach(([position, fighterId]) => {
      positionMap[fighterId] = parseInt(position);
    });
    
    // Then sort the fighters based on their positions
    return [...fighters].sort((a, b) => {
      // If fighter has a position, use it; otherwise put it at the end
      const posA = positionMap[a.id] !== undefined ? positionMap[a.id] : Number.MAX_SAFE_INTEGER;
      const posB = positionMap[b.id] !== undefined ? positionMap[b.id] : Number.MAX_SAFE_INTEGER;
      return posA - posB;
    });
  }, [fighters, positions]);

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
    <div className={
      viewMode === 'normal'
        ? "space-y-4 print:flex print:flex-wrap print:flex-row print:space-y-0"
        : "flex flex-wrap gap-1 justify-center items-start px-0 print:justify-start print:gap-0"
    }>
      {sortedFighters.map((fighter) => (
        <SortableFighter
          key={fighter.id}
          fighter={fighter}
          positions={positions}
          viewMode={viewMode}
        />
      ))}
    </div>
  );
}
