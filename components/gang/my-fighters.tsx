import { useMemo } from 'react';
import { FighterProps } from '@/types/fighter';
import { SortableFighter } from './sortable-fighter';
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

export function MyFighters({ fighters, positions, isLoading, error, viewMode = 'normal', userPermissions }: MyFightersProps) {
  const sortedFighters = useMemo(
    () => sortFightersByPositioning(fighters, positions),
    [fighters, positions]
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
