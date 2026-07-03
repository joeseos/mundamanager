import { cn } from "@/app/lib/utils";

/**
 * Centered full-area loading spinner, used as the Suspense/loading.tsx
 * fallback for dynamic route segments under cacheComponents.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex w-full items-center justify-center py-16", className)}>
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
    </div>
  );
}
