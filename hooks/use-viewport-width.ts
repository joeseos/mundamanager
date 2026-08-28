import { useSyncExternalStore } from 'react';

const DEFAULT_WIDTH = 800;

let viewportWidth = DEFAULT_WIDTH;
const listeners = new Set<() => void>();
let subscriberCount = 0;
let handleResize: (() => void) | null = null;
let handleOrientationChange: (() => void) | null = null;

function shouldStabiliseWidthOnResize() {
  if (typeof window === 'undefined') return false;
  // Touch devices fire resize when browser chrome shows/hides — avoid rescaling cards
  return window.matchMedia('(pointer: coarse)').matches;
}

function publishWidth() {
  if (typeof window === 'undefined') return;
  viewportWidth = window.innerWidth;
  listeners.forEach((listener) => listener());
}

function subscribeToViewportResize() {
  if (typeof window === 'undefined') return;

  subscriberCount += 1;
  if (subscriberCount > 1) return;

  handleResize = () => {
    if (shouldStabiliseWidthOnResize()) return;
    publishWidth();
  };
  handleOrientationChange = publishWidth;

  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', handleOrientationChange);
}

function unsubscribeFromViewportResize() {
  if (typeof window === 'undefined') return;

  subscriberCount -= 1;
  if (subscriberCount > 0) return;

  if (handleResize) {
    window.removeEventListener('resize', handleResize);
    handleResize = null;
  }
  if (handleOrientationChange) {
    window.removeEventListener('orientationchange', handleOrientationChange);
    handleOrientationChange = null;
  }
}

function subscribe(listener: () => void) {
  // Refresh only when nothing is mounted, so a late mount can't rescale existing cards
  if (listeners.size === 0 && typeof window !== 'undefined') {
    viewportWidth = window.innerWidth;
  }
  listeners.add(listener);
  subscribeToViewportResize();

  return () => {
    listeners.delete(listener);
    unsubscribeFromViewportResize();
  };
}

export function useViewportWidth() {
  return useSyncExternalStore(
    subscribe,
    () => viewportWidth,
    () => DEFAULT_WIDTH,
  );
}
