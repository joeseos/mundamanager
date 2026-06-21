'use client';

import { useEffect } from 'react';

let lockCount = 0;
let savedScrollY = 0;

type SavedStyles = {
  overflow: string;
  position: string;
  top: string;
  width: string;
  paddingRight: string;
};

let savedBodyStyles: SavedStyles | null = null;

function lockScroll() {
  if (typeof document === 'undefined') return;

  // Self-heal if state got out of sync
  if (lockCount > 0 && savedBodyStyles === null) lockCount = 0;

  lockCount += 1;
  if (lockCount > 1) return;

  savedScrollY = window.scrollY;

  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

  savedBodyStyles = {
    overflow: document.body.style.overflow,
    position: document.body.style.position,
    top: document.body.style.top,
    width: document.body.style.width,
    paddingRight: document.body.style.paddingRight,
  };

  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.top = `-${savedScrollY}px`;
  document.body.style.width = '100%';

  if (scrollbarWidth > 0) {
    const existingPadding = parseFloat(savedBodyStyles.paddingRight) || 0;
    document.body.style.paddingRight = `${existingPadding + scrollbarWidth}px`;
  }
}

function unlockScroll() {
  if (typeof document === 'undefined') return;

  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0 || !savedBodyStyles) return;

  document.body.style.overflow = savedBodyStyles.overflow;
  document.body.style.position = savedBodyStyles.position;
  document.body.style.top = savedBodyStyles.top;
  document.body.style.width = savedBodyStyles.width;
  document.body.style.paddingRight = savedBodyStyles.paddingRight;

  window.scrollTo(0, savedScrollY);
  savedBodyStyles = null;
}

export function useScrollLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    lockScroll();
    return () => unlockScroll();
  }, [enabled]);
}
