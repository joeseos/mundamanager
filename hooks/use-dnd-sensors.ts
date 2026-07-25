"use client"

import { useCallback, type MouseEvent as ReactMouseEvent } from 'react'
import { MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

export function useDndSensorsConfig() {
  return useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 600, tolerance: 10 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
}

const dragSurfaceStyle = {
  WebkitTouchCallout: 'none',
  WebkitUserSelect: 'none',
  userSelect: 'none',
  WebkitTapHighlightColor: 'transparent',
  touchAction: 'manipulation',
} as const;

// Props for a drag surface that wraps a link. A long press over an `<a href>` makes the browser
// offer its own menu ("Open in New Tab"), which on iOS steals the gesture before the TouchSensor
// delay elapses. Cancelling `contextmenu` is what stops it — the same trick
// fighter-card-action-menu.tsx uses for its menu trigger. dnd-kit has a contextmenu guard of its
// own, but only once a drag has activated, which is too late. The CSS is belt-and-braces for
// iOS; `-webkit-touch-callout` and `user-select` inherit, so they cover the link inside.
//
// Returns nothing when the card isn't draggable, so plain cards keep normal text selection and
// native link behaviour.
export function dragSurfaceProps(isDraggable: boolean) {
  if (!isDraggable) return {};
  return {
    style: dragSurfaceStyle,
    onContextMenu: (e: ReactMouseEvent) => {
      // Only on touch devices, so desktop right-click still opens the browser menu.
      if (window.matchMedia('(pointer: coarse)').matches) e.preventDefault();
    },
  };
}

// A drag that starts and ends on the same spot still leaves the browser with a matching
// mousedown/mouseup (or tap), so it follows the card's `<a href>` and navigates away. dnd-kit
// stops the click propagating, which kills React's onClick, but not the anchor's default
// action. Returns a callback that swallows that one click in the capture phase.
//
// `cardSelector` scopes it to draggable cards, so unrelated UI stays clickable if the listener
// is still armed. Keyboard reorder produces no trailing click, so we skip arming for it.
export function useSuppressClickAfterDrag(cardSelector: string) {
  return useCallback((activatorEvent?: Event | null) => {
    if (activatorEvent instanceof KeyboardEvent) return;

    const suppress = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest(cardSelector)?.closest('a')) return;

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
  }, [cardSelector]);
}
