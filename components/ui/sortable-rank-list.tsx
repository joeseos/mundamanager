"use client"

import { useCallback, useRef } from 'react';
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react';
import { useSortable } from '@dnd-kit/react/sortable';
import { move } from '@dnd-kit/helpers';
import { RestrictToVerticalAxis } from '@dnd-kit/abstract/modifiers';
import { RestrictToElement } from '@dnd-kit/dom/modifiers';
import { LuGripVertical, LuX } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { dndSensorsDistance, dragSurfaceProps } from '@/hooks/use-dnd-sensors';

export interface SortableRankItem {
  id: string;
  name: string;
  /** Shown muted after the name, e.g. a gang owner's username. */
  secondary?: string;
  /** Shown at the end of the row, e.g. a gang's rating. */
  detail?: string | number;
}

function SortableRankRow({
  id,
  index,
  name,
  secondary,
  detail,
  onRemove,
}: {
  id: string;
  index: number;
  name: string;
  secondary?: string;
  detail?: string | number;
  onRemove?: () => void;
}) {
  const { ref, isDragging } = useSortable({ id, index });

  const surface = dragSurfaceProps(true);

  return (
    <div
      ref={ref}
      style={{
        zIndex: isDragging ? 50 : 'auto',
        position: 'relative',
        // Prefer none over dragSurfaceProps' "manipulation" so vertical drags
        // reorder rows instead of scrolling the modal underneath.
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
        WebkitTapHighlightColor: 'transparent',
        touchAction: 'none',
      }}
      className={`flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 cursor-grab ${
        isDragging ? 'shadow-md border-rose-700 cursor-grabbing' : ''
      }`}
      aria-label={`Drag to reorder ${name}`}
      onContextMenu={surface.onContextMenu}
    >
      <span className="inline-flex w-5 shrink-0 items-center justify-center text-sm text-muted-foreground">{index + 1}</span>
      <span className="shrink-0 p-1 text-muted-foreground" aria-hidden="true">
        <LuGripVertical className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">
        {name}
        {secondary && <span className="text-xs text-muted-foreground">{` \u2022 ${secondary}`}</span>}
      </span>
      {detail != null && (
        <span className="shrink-0 text-right text-sm text-muted-foreground">{detail}</span>
      )}
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 cursor-pointer touch-auto p-0"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
        >
          <LuX className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// Rows only move up and down, and never leave the list.
const rankListModifiers = [
  RestrictToVerticalAxis,
  RestrictToElement.configure({
    element: (operation) => operation.source?.element?.parentElement ?? null,
  }),
];

/**
 * Numbered drag-to-reorder list for use inside a modal. Rows are ranked from 1
 * in the order given; dropping a row reports the items in their new order.
 */
export function SortableRankList<T extends SortableRankItem>({
  items,
  onReorder,
  onRemove,
}: {
  items: T[];
  onReorder: (items: T[]) => void;
  onRemove?: (id: string) => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const lockedScrollParentRef = useRef<{
    el: HTMLElement;
    overflowY: string;
    overscrollBehavior: string;
  } | null>(null);

  // The modal body scrolls, and on touch a drag would scroll it instead of
  // moving the row, so its scroll is held while a drag is in progress.
  const unlockModalScroll = useCallback(() => {
    const locked = lockedScrollParentRef.current;
    if (!locked) return;
    locked.el.style.overflowY = locked.overflowY;
    locked.el.style.overscrollBehavior = locked.overscrollBehavior;
    lockedScrollParentRef.current = null;
  }, []);

  const lockModalScroll = useCallback(() => {
    unlockModalScroll();
    let el = listRef.current?.parentElement ?? null;
    while (el) {
      const { overflowY } = window.getComputedStyle(el);
      if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
        lockedScrollParentRef.current = {
          el,
          overflowY: el.style.overflowY,
          overscrollBehavior: el.style.overscrollBehavior,
        };
        el.style.overflowY = 'hidden';
        el.style.overscrollBehavior = 'none';
        break;
      }
      el = el.parentElement;
    }
  }, [unlockModalScroll]);

  const handleDragEnd = (event: DragEndEvent) => {
    unlockModalScroll();
    const reordered = move(items, event);
    if (reordered !== items) onReorder(reordered);
  };

  return (
    <DragDropProvider
      sensors={dndSensorsDistance}
      modifiers={rankListModifiers}
      onDragStart={lockModalScroll}
      onDragEnd={handleDragEnd}
    >
      <div ref={listRef} className="space-y-2" style={{ touchAction: 'none' }}>
        {items.map((item, i) => (
          <SortableRankRow
            key={item.id}
            id={item.id}
            index={i}
            name={item.name}
            secondary={item.secondary}
            detail={item.detail}
            onRemove={onRemove ? () => onRemove(item.id) : undefined}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}
