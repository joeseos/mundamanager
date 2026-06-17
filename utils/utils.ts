import { redirect } from "next/navigation";

/**
 * Redirects to a specified path with an encoded message as a query parameter.
 * @param {('error' | 'success')} type - The type of message, either 'error' or 'success'.
 * @param {string} path - The path to redirect to.
 * @param {string} message - The message to be encoded and added as a query parameter.
 * @returns {never} This function doesn't return as it triggers a redirect.
 */
export function encodedRedirect(
  type: "error" | "success",
  path: string,
  message: string,
) {
  return redirect(`${path}?${type}=${encodeURIComponent(message)}`);
}

/**
 * Validates a user-supplied post-login redirect target to prevent open
 * redirects, returning a safe same-origin relative path (falling back to "/").
 *
 * Per OWASP guidance we parse with the URL API rather than string checks: a
 * naive `startsWith("/")` test misses bypasses such as "/\evil.com", which
 * browsers normalise to the protocol-relative "//evil.com". Resolving against
 * a fixed dummy origin and requiring the result to stay on that origin rejects
 * protocol-relative, absolute and backslash-based inputs alike.
 */
export function safeInternalPath(path?: string | null): string {
  if (!path) return "/";
  try {
    const base = "http://internal.invalid";
    const url = new URL(path, base);
    if (url.origin !== base) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
