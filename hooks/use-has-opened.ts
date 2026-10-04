import { useState } from 'react';

/**
 * False until `isOpen` is first true, then true for good.
 *
 * Render a lazily loaded (next/dynamic) modal only once this is true: its code
 * downloads on the first open instead of with the page, and the modal stays
 * mounted after it closes, so its state carries over between opens as it did
 * when the page always mounted it.
 */
export function useHasOpened(isOpen: boolean) {
  const [hasOpened, setHasOpened] = useState(isOpen);
  // Adjusted during render, so the modal mounts in the same commit that opens it.
  if (isOpen && !hasOpened) setHasOpened(true);
  return hasOpened;
}
