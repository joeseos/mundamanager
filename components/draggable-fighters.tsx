import React, { useState, useEffect } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
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


  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Reduce delay and increase tolerance for better mobile experience
      activationConstraint: {
        delay: 100,
        tolerance: 8, // Increased tolerance for better mobile experience
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
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
  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext 
        items={fighters.map(f => f.id)}
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