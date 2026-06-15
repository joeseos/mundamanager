import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/** Returns false during SSR and hydration, then true after the client has mounted. */
export function useIsMounted() {
  return useSyncExternalStore(noopSubscribe, getClientSnapshot, getServerSnapshot);
}
