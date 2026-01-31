import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import FighterCard from './fighter-card';
import { FighterProps, FighterSkills } from '@/types/fighter';
import { useState, useEffect } from 'react';
import { UserPermissions } from '@/types/user-permissions';

interface SortableFighterProps {
  fighter: FighterProps;
  positions: Record<number, string>;
  onFighterDeleted?: (fighterId: string, fighterCost: number) => void;
  viewMode?: 'normal' | 'small' | 'medium' | 'large';
  userPermissions?: UserPermissions;
}

export function SortableFighter({ fighter, positions, onFighterDeleted, viewMode = 'normal', userPermissions }: SortableFighterProps) {
  const [isDragging, setIsDragging] = useState(false);
  
  // Check if user can edit to determine if drag should be enabled
  const canEdit = userPermissions?.canEdit ?? false;
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: dndKitIsDragging,
  } = useSortable({ 
    id: fighter.id,
    animateLayoutChanges: () => false,
    disabled: !canEdit // Disable drag when user can't edit
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: dndKitIsDragging ? 50 : 'auto',
    position: 'relative',
    pointerEvents: 'auto', // Ensure clicks still work for navigation
  } as const;

  // Update isDragging when dndKitIsDragging changes
  useEffect(() => {
    setIsDragging(dndKitIsDragging);
  }, [dndKitIsDragging]);

  // Show grabbing cursor on document while dragging so it stays visible even when pointer leaves the card
  useEffect(() => {
    if (!dndKitIsDragging) return;
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = 'grabbing';
    return () => {
      document.body.style.cursor = prevCursor;
    };
  }, [dndKitIsDragging]);

  // Extract the first vehicle from the vehicles array for the FighterCard
  const vehicle = fighter.vehicles && fighter.vehicles.length > 0 ? fighter.vehicles[0] : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
    >
      <FighterCard
        {...fighter}
        name={fighter.fighter_name}
        type={fighter.fighter_type}
        skills={fighter.skills}
        vehicle={vehicle}
        disableLink={isDragging}
        viewMode={viewMode}
        isDragging={dndKitIsDragging}
        dragListeners={canEdit ? listeners : undefined}
        dragAttributes={canEdit ? attributes : undefined}
      />
    </div>
  );
} 