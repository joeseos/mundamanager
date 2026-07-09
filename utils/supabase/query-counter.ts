import 'server-only'

/**
 * Dev-only Supabase query counter.
 *
 * Enable with DEBUG_QUERY_COUNT=1 (dev server). Wraps the fetch passed to the
 * Supabase client and logs every PostgREST/RPC round trip with a running
 * total, so a single page navigation's cold/warm query cost can be read
 * directly from the terminal. No-op in production builds.
 */

let total = 0
let windowStart = 0
let windowCount = 0

// A gap of >2s between queries is treated as a new "navigation window" so the
// per-page count resets without needing request-scoped storage.
const WINDOW_GAP_MS = 2000

export function isQueryCountEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.DEBUG_QUERY_COUNT === '1'
}

export function makeCountingFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method ?? 'GET'

    // Only count DB round trips (PostgREST tables + RPCs), not auth/storage.
    if (url.includes('/rest/v1/')) {
      const now = Date.now()
      if (now - windowStart > WINDOW_GAP_MS) {
        windowStart = now
        windowCount = 0
      }
      total += 1
      windowCount += 1

      const target = url.split('/rest/v1/')[1]?.split('?')[0] ?? url
      console.log(`[query-count] #${windowCount} (total ${total}) ${method} ${target}`)
    }

    return fetch(input, init)
  }
}
