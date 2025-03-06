import React, { useState, useMemo } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { MyFighters } from './my-fighters';
import { FighterProps } from '@/types/fighter';

interface DraggableFightersProps {
  fighters: FighterProps[];
  onPositionsUpdate?: (positions: Record<number, string>) => void;
  onFightersReorder?: (newFighters: FighterProps[]) => void;
  initialPositions: Record<number, string>;
}

export function DraggableFighters({ 
  fighters, 
  onPositionsUpdate,
  onFightersReorder,
  initialPositions
}: DraggableFightersProps) {
  const [currentPositions, setCurrentPositions] = useState<Record<number, string>>(initialPositions);
  
  // Optimize the sensor configuration
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 500, // Reduced from 1000ms for better performance
      tolerance: 5,
    },
  });
  
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      delay: 100, // Reduced from 150ms for better performance
      tolerance: 5,
    },
  });
  
  // Determine if we're on a mobile device
  const isMobile = useMemo(() => {
    if (typeof window === "undefined") return false;
    return /Mobi|Android|iPhone/i.test(navigator.userAgent);
  }, []);

  // Use the appropriate sensor based on device type
  const sensors = useSensors(
    typeof window === "undefined" ? pointerSensor :
    isMobile ? touchSensor : pointerSensor,
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    
    if (!active || !over || active.id === over.id) {
      return;
    }

    try {
      const oldIndex = fighters.findIndex((f) => f.id === active.id);
      const newIndex = fighters.findIndex((f) => f.id === over.id);
      
      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      const newFighters = arrayMove(fighters, oldIndex, newIndex);
      
      // Create position object with position numbers as keys and fighter IDs as values
      const newPositions = newFighters.reduce((acc, fighter, index) => ({
        ...acc,
        [index]: fighter.id
      }), {});

      setCurrentPositions(newPositions);
      onPositionsUpdate?.(newPositions);
      onFightersReorder?.(newFighters);
    } catch (error) {
      console.error('Error handling drag end:', error);
    }
  };

  // Memoize the fighter IDs array to prevent unnecessary re-renders
  const fighterIds = useMemo(() => {
    return fighters.map(f => f.id);
  }, [fighters]);

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext 
        items={fighterIds}
        strategy={verticalListSortingStrategy}
      >
        <MyFighters 
          fighters={fighters} 
          positions={currentPositions}
        />
      </SortableContext>
    </DndContext>
  );
} 