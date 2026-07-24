import React, { useMemo } from 'react';
import FighterCard from './fighter-card';
import { FighterProps } from '@/types/fighter';
import { calculateAdjustedStats } from '@/utils/effect-modifiers';
import { SortableFighter } from './sortable-fighter';
import { fighterClassRank } from '@/utils/fighterClassRank';
import { sortFightersByPositioning } from '@/utils/fighter-positioning';
import { GangPageViewMode } from './ViewModeDropdown';
import { UserPermissions } from '@/types/user-permissions';

interface MyFightersProps {
  fighters: FighterProps[];
  isLoading?: boolean;
  error?: string;
  positions: Record<number, string>;
  viewMode?: GangPageViewMode;
  userPermissions?: UserPermissions;
}


// Background image URL
const BACKGROUND_IMAGE_URL = "https://iojoritxhpijprgkjfre.supabase.co/storage/v1/object/public/site-images/light-texture-bg-sm_wqttn8.jpg";

// Add proper image sizes
const imageSizes = {
  mobile: '100vw',
  tablet: '50vw',
  desktop: '800px'
};

export function MyFighters({ fighters, positions, isLoading, error, viewMode = 'normal', userPermissions }: MyFightersProps) {
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

  const sortedFighters = useMemo(
    () => sortFightersByPositioning(fighters, positions),
    [fighters, positions]
  );

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
    return <p className="text-muted-foreground italic">No fighters added yet.</p>;
  }

  const viewModeGridClass = {
    '4-card': 'grid grid-cols-4 gap-1',
    '3-card': 'grid grid-cols-3 gap-1',
    '2-card': 'grid grid-cols-2 gap-1',
  } as const;

  return (
    <div className={
      viewMode === 'normal'
        ? "space-y-4 print:flex print:flex-wrap print:flex-row gap-x-2 print:space-y-0"
        // items-stretch (CSS Grid default) makes every card in a row match the tallest card's
        // height, since each card's own height is content-driven (see fighter-card.tsx).
        : `${viewModeGridClass[viewMode]} w-full items-stretch px-0`
    }>
      {sortedFighters.map((fighter) => (
        <SortableFighter
          key={fighter.id}
          fighter={fighter}
          positions={positions}
          viewMode={viewMode}
          userPermissions={userPermissions}
        />
      ))}
    </div>
  );
}
