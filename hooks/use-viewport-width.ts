import { useEffect, useState } from 'react';

const DEFAULT_WIDTH = 800;

let viewportWidth = typeof window !== 'undefined' ? window.innerWidth : DEFAULT_WIDTH;
const listeners = new Set<() => void>();
let isSubscribed = false;

function shouldStabiliseWidthOnResize() {
  if (typeof window === 'undefined') return false;
  // Touch devices fire resize when browser chrome shows/hides — avoid rescaling cards
  return window.matchMedia('(pointer: coarse)').matches;
}

function subscribeToViewportResize() {
  if (isSubscribed || typeof window === 'undefined') return;
  isSubscribed = true;

  const publishWidth = () => {
    viewportWidth = window.innerWidth;
    listeners.forEach((listener) => listener());
  };

  const handleResize = () => {
    if (shouldStabiliseWidthOnResize()) return;
    publishWidth();
  };

  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', publishWidth);
}

export function useViewportWidth() {
  const [width, setWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : DEFAULT_WIDTH
  );

  useEffect(() => {
    subscribeToViewportResize();
    const listener = () => setWidth(viewportWidth);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return width;
}
