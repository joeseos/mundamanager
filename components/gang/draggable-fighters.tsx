import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDndSensorsConfig } from '@/hooks/use-dnd-sensors';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { MyFighters } from './my-fighters';
import { FighterProps } from '@/types/fighter';
import { GangPageViewMode } from './ViewModeDropdown';
import { UserPermissions } from '@/types/user-permissions';

interface DraggableFightersProps {
  fighters: FighterProps[];
  onPositionsUpdate?: (positions: Record<number, string>) => void;
  onFightersReorder?: (newFighters: FighterProps[]) => void;
  initialPositions: Record<number, string>;
  viewMode?: GangPageViewMode;
  userPermissions?: UserPermissions;
}

const normalizeFighterPositions = (
  positions: Record<number, string>,
  fighters: FighterProps[]
): Record<number, string> => {
  const fighterIds = new Set(fighters.map(fighter => fighter.id));
  const nextPositions = Object.entries(positions)
    .sort(([a], [b]) => Number(a) - Number(b))
    .reduce<Record<number, string>>((acc, [_, fighterId]) => {
      if (fighterIds.has(fighterId)) {
        acc[Object.keys(acc).length] = fighterId;
      }
      return acc;
    }, {});
  const positionedIds = new Set(Object.values(nextPositions));
  const unpositionedFighters = fighters.filter(fighter => !positionedIds.has(fighter.id));

  if (unpositionedFighters.length === 0) {
    return nextPositions;
  }

  const maxPosition = Object.keys(nextPositions).length > 0
    ? Math.max(...Object.keys(nextPositions).map(Number))
    : -1;

  unpositionedFighters.forEach((fighter, index) => {
    nextPositions[maxPosition + index + 1] = fighter.id;
  });

  return nextPositions;
};

const positionsAreEqual = (
  a: Record<number, string>,
  b: Record<number, string>
) => {
  const aEntries = Object.entries(a);
  const bEntries = Object.entries(b);

  return aEntries.length === bEntries.length &&
    aEntries.every(([position, fighterId]) => b[Number(position)] === fighterId);
};

const positionsSignature = (positions: Record<number, string>) =>
  Object.entries(positions)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([position, fighterId]) => `${position}:${fighterId}`)
    .join('|');

export function DraggableFighters({ 
  fighters, 
  onPositionsUpdate,
  onFightersReorder,
  initialPositions,
  viewMode = 'normal',
  userPermissions,
}: DraggableFightersProps) {
  const [currentPositions, setCurrentPositions] = useState<Record<number, string>>(() =>
    normalizeFighterPositions(initialPositions, fighters)
  );
  const lastSyncedPositionsSignature = useRef(positionsSignature(initialPositions));
  const isMounted = useIsMounted();
  const canEdit = userPermissions?.canEdit ?? false;

  const normalizedPositions = useMemo(
    () => normalizeFighterPositions(currentPositions, fighters),
    [currentPositions, fighters]
  );
  if (!positionsAreEqual(currentPositions, normalizedPositions)) {
    setCurrentPositions(normalizedPositions);
  }

  useEffect(() => {
    const signature = positionsSignature(normalizedPositions);
    if (canEdit && signature !== lastSyncedPositionsSignature.current) {
      lastSyncedPositionsSignature.current = signature;
      onPositionsUpdate?.(normalizedPositions);
    }
  }, [canEdit, normalizedPositions, onPositionsUpdate]);
  
  const sortedPositionedFighters = Object.entries(normalizedPositions)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([_, id]) => fighters.find(f => f.id === id))
    .filter(Boolean) as FighterProps[]; // Filter out undefined and null values
  const sortedPositionedIds = new Set(sortedPositionedFighters.map(fighter => fighter.id));
  const sortedFighters = [
    ...sortedPositionedFighters,
    ...fighters.filter(fighter => !sortedPositionedIds.has(fighter.id))
  ];

  const sensors = useDndSensorsConfig();

  // After a pointer drag, the browser still synthesizes a `click` on whatever is under the
  // pointer (often a *different* fighter card than the one dragged). Swallow that one click
  // in the capture phase so no card's `<a>` navigates away. Scoped to fighter-card links only
  // so unrelated UI (nav, "Add Fighter", menus, etc.) stays clickable if the listener is still
  // armed. Keyboard reorder never produces a trailing click, so we skip arming for it.
  const suppressClickAfterDrag = (activatorEvent?: Event | null) => {
    if (activatorEvent instanceof KeyboardEvent) return;

    const suppress = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      // Only eat navigation clicks on fighter cards — leave everything else alone and keep
      // listening until a card click arrives or the timeout clears.
      if (!target.closest('.fighter-card-bg')?.closest('a')) return;

      event.preventDefault();
      event.stopPropagation();
      cleanup();
    };
    const cleanup = () => {
      document.removeEventListener('click', suppress, true);
      window.clearTimeout(timeoutId);
    };
    document.addEventListener('click', suppress, true);
    const timeoutId = window.setTimeout(cleanup, 500);
  };

  const handleDragEnd = async (event: any) => {
    // Always consider suppress for pointer drags — including same-position drops — because a
    // real drag still produces a trailing click.
    suppressClickAfterDrag(event.activatorEvent);

    const { active, over } = event;
    
    if (!active || !over || active.id === over.id) {
      return;
    }

    try {
      // First get the visually sorted fighters based on current positions
      const getSortedFighterIds = () => {
        // Extract position entries and sort them by position number
        const positionEntries = Object.entries(normalizedPositions)
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
      lastSyncedPositionsSignature.current = positionsSignature(newPositions);
      onPositionsUpdate?.(newPositions);
    } catch (error) {
      console.error('Error handling drag end:', error);
    }
  };

  // Render without drag functionality during SSR and initial client render
  if (!isMounted) {
    return (
      <MyFighters
        fighters={sortedFighters}
        positions={normalizedPositions}
        viewMode={viewMode}
        userPermissions={userPermissions}
      />
    );
  }

  // If user doesn't have edit permissions, render without drag functionality
  if (!canEdit) {
    return (
      <MyFighters
        fighters={sortedFighters}
        positions={normalizedPositions}
        viewMode={viewMode}
        userPermissions={userPermissions}
      />
    );
  }

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      onDragCancel={(event) => suppressClickAfterDrag(event.activatorEvent)}
    >
      <SortableContext
        items={sortedFighters.map(f => f.id)}
        strategy={viewMode !== 'normal' ? rectSortingStrategy : verticalListSortingStrategy}
      >
        <MyFighters
          fighters={sortedFighters}
          positions={normalizedPositions}
          viewMode={viewMode}
          userPermissions={userPermissions}
        />
      </SortableContext>
    </DndContext>
  );
} 
