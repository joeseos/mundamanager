import { useEffect, useState } from 'react';

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

export function useViewportWidth() {
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  useEffect(() => {
    setWidth(window.innerWidth);
    subscribeToViewportResize();

    const listener = () => setWidth(viewportWidth);
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
      unsubscribeFromViewportResize();
    };
  }, []);

  return width;
}
