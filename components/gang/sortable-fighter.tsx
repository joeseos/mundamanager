import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import FighterCard from './fighter-card';
import { FighterProps, FighterSkills } from '@/types/fighter';
import { useState, useEffect } from 'react';

interface SortableFighterProps {
  fighter: FighterProps;
  positions: Record<number, string>;
  onFighterDeleted?: (fighterId: string, fighterCost: number) => void;
  viewMode?: 'normal' | 'small' | 'medium' | 'large';
}

export function SortableFighter({ fighter, positions, onFighterDeleted, viewMode = 'normal' }: SortableFighterProps) {
  const [isDragging, setIsDragging] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: dndKitIsDragging,
  } = useSortable({ 
    id: fighter.id,
    animateLayoutChanges: () => false
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    cursor: dndKitIsDragging ? 'grabbing' : 'grab',
    touchAction: 'manipulation',
    WebkitTouchCallout: 'none',
    WebkitUserSelect: 'none',
    zIndex: dndKitIsDragging ? 50 : 'auto',
    position: 'relative',
  } as const;

  // Update isDragging when dndKitIsDragging changes
  useEffect(() => {
    setIsDragging(dndKitIsDragging);
  }, [dndKitIsDragging]);

  // Extract the first vehicle from the vehicles array for the FighterCard
  const vehicle = fighter.vehicles && fighter.vehicles.length > 0 ? fighter.vehicles[0] : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <FighterCard
        {...fighter}
        name={fighter.fighter_name}
        type={fighter.fighter_type}
        skills={fighter.skills}
        vehicle={vehicle}
        disableLink={isDragging}
        viewMode={viewMode}
      />
    </div>
  );
} 