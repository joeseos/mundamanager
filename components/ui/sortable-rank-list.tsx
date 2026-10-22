"use client"

import { useCallback, useRef } from 'react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import { LuGripVertical, LuX } from 'react-icons/lu';
import { Button } from '@/components/ui/button';
import { useDndSensorsConfig, dragSurfaceProps } from '@/hooks/use-dnd-sensors';

export interface SortableRankItem {
  id: string;
  name: string;
  /** Shown at the end of the row, e.g. a gang's rating. */
  detail?: string | number;
}

function SortableRankRow({
  id,
  rank,
  name,
  detail,
  onRemove,
}: {
  id: string;
  rank: number;
  name: string;
  detail?: string | number;
  onRemove?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const surface = dragSurfaceProps(true);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
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
      {...attributes}
      {...listeners}
    >
      <span className="inline-flex w-5 shrink-0 items-center justify-center text-sm text-muted-foreground">{rank}</span>
      <span className="shrink-0 p-1 text-muted-foreground" aria-hidden="true">
        <LuGripVertical className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
      {detail != null && (
        <span className="shrink-0 text-right text-sm text-muted-foreground">{detail}</span>
      )}
      {onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 shrink-0 cursor-pointer touch-auto p-0"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRemove}
          aria-label={`Remove ${name}`}
        >
          <LuX className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

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
  const sensors = useDndSensorsConfig('distance');
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
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragStart={lockModalScroll}
      onDragEnd={handleDragEnd}
      onDragCancel={unlockModalScroll}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div ref={listRef} className="space-y-2" style={{ touchAction: 'none' }}>
          {items.map((item, i) => (
            <SortableRankRow
              key={item.id}
              id={item.id}
              rank={i + 1}
              name={item.name}
              detail={item.detail}
              onRemove={onRemove ? () => onRemove(item.id) : undefined}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
