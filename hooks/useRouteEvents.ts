'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function useRouteEvents(eventName: string, callback: () => void) {
  const router = useRouter();

  useEffect(() => {
    // Add event listener
    window.addEventListener(eventName, callback);

    // Cleanup
    return () => {
      window.removeEventListener(eventName, callback);
    };
  }, [eventName, callback]);

  const emitEvent = () => {
    window.dispatchEvent(new Event(eventName));
    router.refresh();
  };

  return { emitEvent };
} 