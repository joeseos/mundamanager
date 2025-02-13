import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import FighterCard from './fighter-card';
import { FighterProps } from '@/types/fighter';
import { useState, useEffect } from 'react';

interface SortableFighterProps {
  fighter: FighterProps;
  positions: Record<number, string>;
  onFighterDeleted?: (fighterId: string, fighterCost: number) => void;
}

export function SortableFighter({ fighter, positions, onFighterDeleted }: SortableFighterProps) {
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
    transform: CSS.Transform.toString(transform),
    transition,
    cursor: dndKitIsDragging ? 'grabbing' : 'grab',
    touchAction: 'none',
  };

  // Update isDragging when dndKitIsDragging changes
  useEffect(() => {
    setIsDragging(dndKitIsDragging);
  }, [dndKitIsDragging]);

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners}
      className="relative group"
    >
      <div className="absolute left-2 top-1/2 -translate-y-1/2 opacity-50 group-hover:opacity-100 transition-opacity">
        ⋮⋮
      </div>
      <div className="pl-8">
        <FighterCard 
          {...fighter} 
          name={fighter.fighter_name}
          type={fighter.fighter_type}
          disableLink={isDragging}
        />
      </div>
    </div>
  );
} 