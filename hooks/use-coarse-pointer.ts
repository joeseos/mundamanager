'use client';

import { useSyncExternalStore } from 'react';

const COARSE_MQ = '(hover: none) and (pointer: coarse)';
let _coarseMql: MediaQueryList | null = null;

const getCoarseMql = () => {
  if (typeof window === 'undefined') return null;
  return (_coarseMql ??= window.matchMedia(COARSE_MQ));
};

const subscribeCoarsePointer = (onStoreChange: () => void) => {
  const mql = getCoarseMql();
  mql?.addEventListener('change', onStoreChange);
  return () => mql?.removeEventListener('change', onStoreChange);
};

const getCoarsePointerSnapshot = () => getCoarseMql()?.matches ?? false;
const getCoarsePointerServerSnapshot = () => false;

export function useCoarsePointer() {
  return useSyncExternalStore(
    subscribeCoarsePointer,
    getCoarsePointerSnapshot,
    getCoarsePointerServerSnapshot,
  );
}
