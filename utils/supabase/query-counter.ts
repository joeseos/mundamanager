/**
 * Supabase round-trip counter.
 *
 * Note: no `import 'server-only'` here, unlike the rest of utils/supabase.
 * This module is imported by proxy.ts, which runs in the Edge runtime rather
 * than a react-server context, where that guard can fail to resolve. The
 * server-side entry point (utils/supabase/server.ts) still carries its own
 * `server-only` import, so the page path stays guarded.
 *
 * Enable with DEBUG_QUERY_COUNT=1. Wraps the fetch passed to the Supabase
 * client and logs every round trip — PostgREST, RPC, auth and storage alike —
 * with a category, a duration and a running total, so a single page
 * navigation's cold/warm cost can be read directly from the terminal.
 *
 * Deliberately measures every category rather than a suspected one: which
 * layer dominates a given route is the question, not an assumption. The
 * per-window summary prints the split so a route can be profiled in one load.
 *
 * Opt-in by env var only, so it can run against a production build (`npm run
 * build && npm start`) where `unstable_cache` behaves representatively — dev
 * cache behaviour is not. Never set DEBUG_QUERY_COUNT in a deployed
 * environment: it adds a fetch wrapper and a log line to every query.
 *
 * Two caveats when reading the output. The proxy runs in the Edge runtime and
 * the page in the Node runtime, so each holds its own module instance and its
 * own totals — compare the `proxy/` and `page/` labels, not the running count.
 * And a window's summary line only prints once the *next* window opens, so
 * load the route twice to see the first one.
 */

type Category = 'rest' | 'auth' | 'jwks' | 'storage' | 'other'

let total = 0
let windowStart = 0
let windowCount = 0
let windowByCategory: Record<string, number> = {}

// A gap of >2s between round trips is treated as a new "navigation window" so
// the per-page count resets without needing request-scoped storage.
const WINDOW_GAP_MS = 2000

export function isQueryCountEnabled(): boolean {
  return process.env.DEBUG_QUERY_COUNT === '1'
}

function classify(url: string): { category: Category; target: string } {
  // JWKS is split out from auth: it is the signal for whether a freshly
  // constructed client re-fetches the key set instead of verifying locally.
  if (url.includes('/.well-known/jwks.json')) {
    return { category: 'jwks', target: 'jwks.json' }
  }
  if (url.includes('/rest/v1/')) {
    return { category: 'rest', target: url.split('/rest/v1/')[1]?.split('?')[0] ?? url }
  }
  if (url.includes('/auth/v1/')) {
    return { category: 'auth', target: url.split('/auth/v1/')[1]?.split('?')[0] ?? url }
  }
  if (url.includes('/storage/v1/')) {
    return { category: 'storage', target: url.split('/storage/v1/')[1]?.split('?')[0] ?? url }
  }
  return { category: 'other', target: url }
}

function flushWindow() {
  if (windowCount === 0) return
  const split = Object.entries(windowByCategory)
    .map(([category, count]) => `${category} ${count}`)
    .join(', ')
  console.log(`[query-count] --- window closed: ${windowCount} round trips (${split}) ---`)
}

/**
 * @param label distinguishes which layer issued the call, so double work
 * across proxy and page shows up as two labelled lines rather than one count.
 */
export function makeCountingFetch(label = 'server'): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method ?? 'GET'
    const { category, target } = classify(url)

    const now = Date.now()
    if (now - windowStart > WINDOW_GAP_MS) {
      flushWindow()
      windowStart = now
      windowCount = 0
      windowByCategory = {}
    }
    total += 1
    windowCount += 1
    windowByCategory[category] = (windowByCategory[category] ?? 0) + 1

    // Captured now, not in `finally`: the page fires its fetches concurrently
    // (Promise.all in app/page.tsx), so the shared counters have already moved
    // on by the time any individual call settles.
    const index = windowCount
    const runningTotal = total

    const startedAt = Date.now()
    try {
      return await fetch(input, init)
    } finally {
      // Duration separates a real network round trip from a local operation,
      // which is what distinguishes local JWT verification from an auth-server call.
      const ms = Date.now() - startedAt
      console.log(
        `[query-count] #${index} (total ${runningTotal}) [${label}/${category}] ${method} ${target} ${ms}ms`
      )
    }
  }
}
