'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useFloating, offset, flip, shift } from '@floating-ui/react-dom';
import { useFighterCardModals } from './fighter-card-modals-context';

interface FighterCardActionMenuProps {
  fighterId: string;
  isCrewWithVehicle: boolean;
  isSpyrer?: boolean;
  disableLink?: boolean;
  children: ReactNode;
}

/** Max movement (px) to count as a tap on menu items; avoids firing when user is scrolling */
const MENU_TAP_MOVE_THRESHOLD = 10;

export function FighterCardActionMenu({
  fighterId,
  isCrewWithVehicle,
  isSpyrer = false,
  disableLink = false,
  children,
}: FighterCardActionMenuProps) {
  const modalsContext = useFighterCardModals();
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const ignoreClickRef = useRef(false);
  const referenceElementRef = useRef<HTMLDivElement | null>(null);
  const menuTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Only one card's action menu is open at a time; context holds which fighter id is open
  const isOpen = modalsContext?.openActionMenuFighterId === fighterId;
  const setOpenActionMenuFighterId = modalsContext?.setOpenActionMenuFighterId;

  const { refs, floatingStyles, update } = useFloating({
    placement: 'bottom-start',
    strategy: 'fixed',
    middleware: [offset(8), flip(), shift({ padding: 8 })],
  });

  const closeMenu = useCallback(() => {
    setOpenActionMenuFighterId?.(null);
    setCoords(null);
  }, [setOpenActionMenuFighterId]);

  // Clear local coords when another card's menu opens (only one menu open at a time)
  useEffect(() => {
    if (modalsContext?.openActionMenuFighterId !== fighterId) {
      setCoords(null);
    }
  }, [fighterId, modalsContext?.openActionMenuFighterId]);

  // Update floating position when reference element is set
  useEffect(() => {
    if (isOpen && coords && referenceElementRef.current) {
      // Use requestAnimationFrame to ensure DOM is updated before calling update
      requestAnimationFrame(() => {
        if (referenceElementRef.current) {
          update();
        }
      });
    }
  }, [isOpen, coords, update]);

  // Outside click and Escape handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const floatingEl = refs.floating.current;
      if (!floatingEl) return;
      const target = event.target as Node | null;
      if (target && floatingEl.contains(target)) return;
      closeMenu();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen, closeMenu, refs.floating]);

  const openMenuAt = useCallback(
    (clientX: number, clientY: number) => {
      if (!modalsContext || disableLink || !setOpenActionMenuFighterId) return;
      setOpenActionMenuFighterId(fighterId);
      setCoords({ x: clientX, y: clientY });
      ignoreClickRef.current = true;
    },
    [modalsContext, disableLink, setOpenActionMenuFighterId, fighterId],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disableLink) return;
    // Only primary button
    if (event.button !== 0) return;

    const target = event.target as HTMLElement | null;
    // Only open menu when pressing on the icon (menu trigger)
    if (!target?.closest('[data-fighter-card-menu-trigger]')) {
      return;
    }

    // Prevent card drag when pressing on menu trigger
    event.stopPropagation();
    event.preventDefault();

    openMenuAt(event.clientX, event.clientY);
  };

  // Handle touch events separately for mobile - dnd-kit's TouchSensor listens
  // for native touchstart events, not pointer events, so we need to stop those too
  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (disableLink) return;

    const target = event.target as HTMLElement | null;
    // Only intercept touch on the menu trigger icon
    if (!target?.closest('[data-fighter-card-menu-trigger]')) {
      return;
    }

    // Prevent card drag (dnd-kit TouchSensor) when touching menu trigger
    event.stopPropagation();
    // Prevent browser's native long-press context menu (e.g. "Open in new tab" on the link).
    event.preventDefault();

    // Get touch coordinates for menu positioning
    const touch = event.touches[0];
    if (touch) {
      openMenuAt(touch.clientX, touch.clientY);
    }
  };

  // Prevent native browser context menu (e.g. "Open in new tab", "Copy link") when
  // long-pressing on the menu trigger icon on mobile - allows our custom menu to show instead
  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-fighter-card-menu-trigger]')) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (ignoreClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      ignoreClickRef.current = false;
    }
  };

  const handleAddXp = () => {
    if (!modalsContext) return;
    closeMenu();
    modalsContext.openXpModal(fighterId);
  };

  // Touch handlers so menu items respond on first tap on mobile (avoid synthetic click delay / focus-then-click)
  const handleMenuTouchStart = (e: React.TouchEvent<HTMLButtonElement>) => {
    const t = e.touches[0];
    if (t) menuTouchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleMenuTouchEnd = (
    e: React.TouchEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    const start = menuTouchStartRef.current;
    menuTouchStartRef.current = null;
    const t = e.changedTouches[0];
    if (!t || !start) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= MENU_TAP_MOVE_THRESHOLD * MENU_TAP_MOVE_THRESHOLD) {
      e.preventDefault();
      action();
    }
  };

  const handleAddInjury = () => {
    if (!modalsContext) return;
    closeMenu();
    modalsContext.openInjuryModal(fighterId, { openAddModal: true });
  };

  const handleAddVehicleDamage = () => {
    if (!modalsContext) return;
    if (!isCrewWithVehicle) return;
    closeMenu();
    modalsContext.openVehicleDamageModal(fighterId, { openAddModal: true });
  };

  // If context is not available (e.g. print views), just render children without menu behaviour
  if (!modalsContext) {
    return <>{children}</>;
  }

  return (
    <div
      className="relative"
      onPointerDownCapture={handlePointerDown}
      onTouchStartCapture={handleTouchStart}
      onContextMenuCapture={handleContextMenu}
      onClickCapture={handleClickCapture}
    >
      {children}

      {/* Invisible reference element at pointer position */}
      {isOpen && coords && (
        <div
          ref={(node) => {
            referenceElementRef.current = node;
            refs.setReference(node);
          }}
          style={{
            position: 'fixed',
            left: coords.x,
            top: coords.y,
            width: 0,
            height: 0,
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        />
      )}

      {isOpen && coords && (
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          className="z-50 min-w-[12rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md print:hidden"
        >
          <button
            type="button"
            className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={handleAddXp}
            onTouchStart={handleMenuTouchStart}
            onTouchEnd={(e) => handleMenuTouchEnd(e, handleAddXp)}
          >
            Add XP
          </button>
          <button
            type="button"
            className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={handleAddInjury}
            onTouchStart={handleMenuTouchStart}
            onTouchEnd={(e) => handleMenuTouchEnd(e, handleAddInjury)}
          >
            {isSpyrer ? 'Add Rig Glitches' : 'Add Lasting Injuries'}
          </button>
          {isCrewWithVehicle && (
            <button
              type="button"
              className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onClick={handleAddVehicleDamage}
              onTouchStart={handleMenuTouchStart}
              onTouchEnd={(e) => handleMenuTouchEnd(e, handleAddVehicleDamage)}
            >
              Add Lasting Damage
            </button>
          )}
        </div>
      )}
    </div>
  );
}

