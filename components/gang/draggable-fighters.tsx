import React, { useState, useEffect } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, Sensor } from '@dnd-kit/core';
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { MyFighters } from './my-fighters';
import { FighterProps } from '@/types/fighter';

interface DraggableFightersProps {
  fighters: FighterProps[];
  onPositionsUpdate?: (positions: Record<number, string>) => void;
  onFightersReorder?: (newFighters: FighterProps[]) => void;
  initialPositions: Record<number, string>;
  viewMode?: 'normal' | 'small' | 'medium' | 'large';
}

export function DraggableFighters({ 
  fighters, 
  onPositionsUpdate,
  onFightersReorder,
  initialPositions,
  viewMode = 'normal',
}: DraggableFightersProps) {
  const [currentPositions, setCurrentPositions] = useState<Record<number, string>>(initialPositions);
  
  // Add useEffect to ensure all fighters have positions
  useEffect(() => {
    // Ensure all fighters have positions
    const unpositionedFighters = fighters.filter(f => 
      !Object.values(currentPositions).includes(f.id)
    );
    
    if (unpositionedFighters.length > 0) {
      // Get the next available position
      const maxPosition = Object.keys(currentPositions).length > 0 
        ? Math.max(...Object.keys(currentPositions).map(Number)) 
        : -1;
      
      // Create new positions for unpositioned fighters
      const newPositions = { ...currentPositions };
      unpositionedFighters.forEach((fighter, index) => {
        newPositions[maxPosition + index + 1] = fighter.id;
      });
      
      // Update positions
      setCurrentPositions(newPositions);
      console.log("Added positions for unpositioned fighters:", 
        unpositionedFighters.map(f => f.id),
        newPositions
      );
      
      // Also inform parent component about new positions
      onPositionsUpdate?.(newPositions);
    }
  }, [fighters, currentPositions, onPositionsUpdate]);
  
  const sortedFighters = Object.entries(currentPositions)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([_, id]) => fighters.find(f => f.id === id))
    .filter(Boolean) as FighterProps[]; // Filter out undefined and null values

  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 750,
      tolerance: 5,
    },
  });
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      delay: 150,
      tolerance: 5,
    },
  });
  const sensors = useSensors(
    typeof window === "undefined" ? pointerSensor :
    /Mobi|Android|iPhone/i.test(navigator.userAgent) ? touchSensor : pointerSensor,
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
      // First get the visually sorted fighters based on current positions
      const getSortedFighterIds = () => {
        // Extract position entries and sort them by position number
        const positionEntries = Object.entries(currentPositions)
          .map(([pos, id]) => ({ pos: parseInt(pos), id }))
          .sort((a, b) => a.pos - b.pos);
        
        // Get the IDs in position order
        return positionEntries.map(entry => entry.id);
      };
      
      const sortedIds = getSortedFighterIds();
      
      // Find indices in the sorted array (this matches the visual order)
      const oldIndex = sortedIds.indexOf(active.id);
      const newIndex = sortedIds.indexOf(over.id);
      
      if (oldIndex === -1 || newIndex === -1) {
        console.error('Could not find fighter indices in sorted IDs', { 
          active: active.id, 
          over: over.id,
          sortedIds
        });
        return;
      }
      
      // Get fighter name for logging
      const draggedFighter = fighters.find(f => f.id === active.id);
      if (!draggedFighter) {
        console.error('Could not find dragged fighter', { id: active.id });
        return;
      }
      
      console.log('Drag operation:', { 
        fighter: draggedFighter.fighter_name, 
        from: oldIndex, 
        to: newIndex,
        activeId: active.id,
        overId: over.id
      });
      
      // Create new sorted IDs with the dragged item moved
      const newSortedIds = [...sortedIds];
      newSortedIds.splice(oldIndex, 1); // Remove from old position
      newSortedIds.splice(newIndex, 0, active.id); // Insert at new position
      
      // Create new positions object based on the new order
      const newPositions = newSortedIds.reduce((acc, id, index) => ({
        ...acc,
        [index]: id
      }), {});
      
      console.log('New positions:', newPositions);
      
      // Create new fighters array in the new order
      const newFighters = newSortedIds
        .map(id => fighters.find(f => f.id === id))
        .filter(Boolean) as FighterProps[];
      
      // First update local state
      setCurrentPositions(newPositions);
      
      // Then call the parent callbacks
      onFightersReorder?.(newFighters);
      onPositionsUpdate?.(newPositions);
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
        items={sortedFighters.map(f => f.id)}
        strategy={viewMode !== 'normal' ? rectSortingStrategy : verticalListSortingStrategy}
      >
        <MyFighters
          fighters={sortedFighters}
          positions={currentPositions}
          viewMode={viewMode}
        />
      </SortableContext>
    </DndContext>
  );
} 