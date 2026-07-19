import { useEffect, useMemo, useRef, useState } from 'react';
import { DragDropProvider, type DragEndEvent, type DragOverEvent } from '@dnd-kit/react';
import { dndSensors } from '@/utils/dnd-sensors';
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
  // Order changes live during a drag (onDragOver); persistence and parent
  // callbacks must wait until the drag settles
  const [isSorting, setIsSorting] = useState(false);
  const dragStartPositions = useRef<Record<number, string> | null>(null);
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
    if (canEdit && !isSorting && signature !== lastSyncedPositionsSignature.current) {
      lastSyncedPositionsSignature.current = signature;
      onPositionsUpdate?.(normalizedPositions);
    }
  }, [canEdit, isSorting, normalizedPositions, onPositionsUpdate]);
  
  const sortedPositionedFighters = Object.entries(normalizedPositions)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([_, id]) => fighters.find(f => f.id === id))
    .filter(Boolean) as FighterProps[]; // Filter out undefined and null values
  const sortedPositionedIds = new Set(sortedPositionedFighters.map(fighter => fighter.id));
  const sortedFighters = [
    ...sortedPositionedFighters,
    ...fighters.filter(fighter => !sortedPositionedIds.has(fighter.id))
  ];

  const handleDragStart = () => {
    dragStartPositions.current = normalizedPositions;
    setIsSorting(true);
  };

  // Custom live sorting: the library's built-in optimistic sorting jitters
  // with variable-height cards (dnd-kit#1950/#2088), so we prevent it and
  // place the dragged id at the target's slot in our own state instead
  const handleDragOver = (event: DragOverEvent) => {
    event.preventDefault();
    const { source, target } = event.operation;
    if (!source || !target || source.id === target.id) return;

    setCurrentPositions(prev => {
      const ids = Object.entries(prev)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, id]) => id);
      const from = ids.indexOf(String(source.id));
      const to = ids.indexOf(String(target.id));
      if (from === -1 || to === -1 || from === to) return prev;

      ids.splice(from, 1);
      ids.splice(to, 0, String(source.id));
      return ids.reduce<Record<number, string>>((acc, id, index) => ({
        ...acc,
        [index]: id
      }), {});
    });
  };

  // Must stay synchronous: the drop animation waits for this handler's React
  // transition to settle (onPositionsUpdate persists via the sync effect
  // once isSorting clears — a server action dispatched from here would
  // entangle with the drop's transition and freeze the card)
  const handleDragEnd = (event: DragEndEvent) => {
    setIsSorting(false);
    const startPositions = dragStartPositions.current;
    dragStartPositions.current = null;

    if (event.canceled) {
      if (startPositions) setCurrentPositions(startPositions);
      return;
    }

    if (startPositions && !positionsAreEqual(startPositions, normalizedPositions)) {
      const newFighters = Object.entries(normalizedPositions)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, id]) => fighters.find(f => f.id === id))
        .filter(Boolean) as FighterProps[];
      onFightersReorder?.(newFighters);
    }
  };

  // Sortable items are disabled per-fighter via `disabled: !canEdit` in SortableFighter
  return (
    <DragDropProvider
      sensors={dndSensors}
      onDragStart={canEdit ? handleDragStart : undefined}
      onDragOver={canEdit ? handleDragOver : undefined}
      onDragEnd={canEdit ? handleDragEnd : undefined}
    >
      <MyFighters
        fighters={sortedFighters}
        positions={normalizedPositions}
        viewMode={viewMode}
        userPermissions={userPermissions}
      />
    </DragDropProvider>
  );
}
