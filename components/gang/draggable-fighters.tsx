import { useEffect, useMemo, useRef, useState } from 'react';
import { DragDropProvider, type DragEndEvent, type DragOverEvent, type DragStartEvent } from '@dnd-kit/react';
import { arrayMove } from '@dnd-kit/helpers';
import { dndSensors, useSuppressClickAfterDrag } from '@/hooks/use-dnd-sensors';
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

const positionsFromIds = (ids: string[]) =>
  ids.reduce<Record<number, string>>((acc, id, index) => {
    acc[index] = id;
    return acc;
  }, {});

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
  // The order changes live during a drag (handleDragOver), so saving and the parent callbacks
  // wait until the drag settles.
  const [isSorting, setIsSorting] = useState(false);
  // The order at drag start, and the live order during the drag. Kept in refs so handleDragEnd
  // reads the last move even if its render hasn't committed yet.
  const dragStartIds = useRef<string[] | null>(null);
  const dragIds = useRef<string[] | null>(null);
  // Grid rows are as tall as their tallest card, so moving a killed card into a row of other
  // killed cards shrinks that row, which moves the swap point past the pointer and flips the
  // order back. All rows keep the tallest height while a drag is in progress.
  const [dragRowHeight, setDragRowHeight] = useState<number | null>(null);
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

  const suppressClickAfterDrag = useSuppressClickAfterDrag('.fighter-card-bg');

  const handleDragStart = (event: DragStartEvent) => {
    dragStartIds.current = dragIds.current = sortedFighters.map(fighter => fighter.id);
    setIsSorting(true);

    const grid = viewMode !== 'normal' ? event.operation.source?.element?.parentElement : null;
    if (grid) {
      setDragRowHeight(Math.max(...Array.from(grid.children, card => card.getBoundingClientRect().height)));
    }
  };

  // The library's built-in optimistic sorting jitters when cards differ a lot in height
  // (killed/retired cards collapse), flipping the order back and forth at the swap point
  // (dnd-kit#1950, #2088). So it is turned off here, and the dragged fighter takes the target's
  // slot in our own state instead. Pairs with the directionBiased collision detector in
  // SortableFighter.
  const handleDragOver = (event: DragOverEvent) => {
    event.preventDefault();
    const { source, target } = event.operation;

    const ids = dragIds.current;
    if (!ids || !source || !target || source.id === target.id) return;
    const from = ids.indexOf(String(source.id));
    const to = ids.indexOf(String(target.id));
    if (from === -1 || to === -1) return;

    dragIds.current = arrayMove(ids, from, to);
    setCurrentPositions(positionsFromIds(dragIds.current));
  };

  // Keep this synchronous: the drop animation waits for the React update it triggers, and a
  // server action started here would hold that update and freeze the card. Saving happens in
  // the effect above once isSorting clears.
  const handleDragEnd = (event: DragEndEvent) => {
    // Always consider suppress for pointer drags — including same-position drops — because a
    // real drag still produces a trailing click.
    suppressClickAfterDrag(event.operation.activatorEvent);
    setIsSorting(false);
    setDragRowHeight(null);
    const startIds = dragStartIds.current;
    const endIds = dragIds.current;
    dragStartIds.current = dragIds.current = null;
    if (!startIds || !endIds) return;

    if (event.canceled) {
      setCurrentPositions(positionsFromIds(startIds));
      return;
    }

    if (endIds.some((id, index) => id !== startIds[index])) {
      onFightersReorder?.(endIds
        .map(id => fighters.find(f => f.id === id))
        .filter(Boolean) as FighterProps[]);
    }
  };

  // Each SortableFighter disables itself when the user can't edit, so the provider is always
  // rendered; the library registers entities in effects, so this is also safe to server-render.
  return (
    <DragDropProvider
      sensors={dndSensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <MyFighters
        fighters={sortedFighters}
        positions={normalizedPositions}
        viewMode={viewMode}
        userPermissions={userPermissions}
        rowHeight={dragRowHeight}
      />
    </DragDropProvider>
  );
}
