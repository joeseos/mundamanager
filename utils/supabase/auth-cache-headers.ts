import { type NextResponse } from 'next/server';

/** Same values @supabase/ssr 0.12.7 passes to setAll (plain object, not Headers/Map). */
export const AUTH_CACHE_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
  Expires: '0',
  Pragma: 'no-cache',
};

export function recordFromAuthHeaders(headers: unknown): Record<string, string> {
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (headers instanceof Map) {
    const record: Record<string, string> = {};
    for (const [key, value] of headers) {
      if (typeof key === 'string' && typeof value === 'string') {
        record[key] = value;
      }
    }
    return record;
  }
  if (Array.isArray(headers)) {
    const record: Record<string, string> = {};
    for (const entry of headers) {
      if (
        Array.isArray(entry) &&
        typeof entry[0] === 'string' &&
        typeof entry[1] === 'string'
      ) {
        record[entry[0]] = entry[1];
      }
    }
    return record;
  }
  if (headers && typeof headers === 'object') {
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') record[key] = value;
    }
    return record;
  }
  return {};
}

export function applyAuthCacheHeaders(
  response: NextResponse,
  headers: unknown = AUTH_CACHE_HEADERS,
) {
  for (const [key, value] of Object.entries(recordFromAuthHeaders(headers))) {
    response.headers.set(key, value);
  }
}

export function copyAuthResponse(
  source: NextResponse,
  target: NextResponse,
  headerNames: Iterable<string>,
) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
  for (const header of headerNames) {
    const value = source.headers.get(header);
    if (value) target.headers.set(header, value);
  }
  return target;
}
