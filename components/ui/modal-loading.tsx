/**
 * Shown by a lazily loaded modal while its code downloads on the first open.
 * Uses the same backdrop as Modal, so the modal appears over it without a flash.
 */
export default function ModalLoading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="fixed inset-0 flex justify-center items-center z-[100] bg-black/50 dark:bg-neutral-700/50"
    >
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
    </div>
  );
}

/** The same for lazily loaded content inside a modal that is already showing. */
export function ModalContentLoading() {
  return (
    <div role="status" aria-label="Loading" className="flex justify-center py-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  );
}
