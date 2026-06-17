/**
 * Validates a user-supplied post-login redirect target to prevent open
 * redirects. Returns the path only if it is a same-origin absolute path
 * (starts with a single "/"), otherwise falls back to the home page.
 *
 * This is the single source of truth for the `next` redirect param used
 * across the sign-in flow (proxy, sign-in action, auth callback, sign-in page).
 */
export function safeInternalPath(path?: string | null): string {
  if (!path) return "/";
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  return path;
}
