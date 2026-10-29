import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getUserIdFromClaims, safePostSignInPath, signInPath } from './utils/auth'
import { lowerCaseUuids } from './utils/uuid'

function createSupabaseProxyClient(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  return {
    supabase,
    getResponse() {
      return response;
    },
  };
}

function copyResponseCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
  return target;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // An upper-case id would find the row in Postgres but miss lower-case
  // lookups, cache keys and cache tags, so redirect to the canonical URL
  const canonicalPath = lowerCaseUuids(pathname);
  if (canonicalPath !== pathname) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.pathname = canonicalPath;
    return NextResponse.redirect(canonicalUrl, 308);
  }

  // Forum pages moved from ?page=<n> to /page/<n>, so links from before (e.g. in notifications) still work
  const oldForumPage = request.nextUrl.searchParams.get('page');
  if (oldForumPage && /^\/forum\/[^/]+(?:\/[^/]+)?$/.test(pathname)) {
    const pageUrl = request.nextUrl.clone();
    pageUrl.searchParams.delete('page');
    pageUrl.pathname = `${pathname}/page/${oldForumPage}`;
    return NextResponse.redirect(pageUrl, 308);
  }

  // Auth pages - check if user is already logged in and redirect away
  const authPages = ['/sign-in', '/sign-up'];

  if (authPages.includes(pathname)) {
    const { supabase, getResponse } = createSupabaseProxyClient(request);

    const userId = await getUserIdFromClaims(supabase);

    if (userId) {
      const destination = safePostSignInPath(request.nextUrl.searchParams.get('next'));
      const redirectResponse = NextResponse.redirect(new URL(destination, request.url));
      return copyResponseCookies(getResponse(), redirectResponse);
    }
    return getResponse();
  }

  // Create response and Supabase client bound to the incoming request/response (Edge-safe)
  const { supabase, getResponse } = createSupabaseProxyClient(request);

  // Check authentication
  const userId = await getUserIdFromClaims(supabase);

  // Always redirect, never render sign-in at "/" - that broke Server Action cookie persistence.
  if (!userId) {
    // Build a clean redirect path: drop common tracking params
    const cleanUrl = request.nextUrl.clone();
    const ignoredRedirectParams = [
      '_rsc', 'fbclid', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'
    ];
    ignoredRedirectParams.forEach((k) => cleanUrl.searchParams.delete(k));

    const redirectPath = `${cleanUrl.pathname}${cleanUrl.search}`;

    const redirectResponse = NextResponse.redirect(new URL(signInPath(redirectPath), request.url));
    return copyResponseCookies(getResponse(), redirectResponse);
  }

  return getResponse();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/ (ALL API routes - they handle their own auth)
     * - _next/ (ALL Next.js internals: static files, image optimization, data fetching, HMR)
     *   Important: _next/data/* is used for client-side navigation with getServerSideProps/getStaticProps
     * - Static assets by file extension
     * - Common static files (favicon, robots, sitemap, etc.)
     * - Service workers and special paths
     * - Public pages (and their .rsc requests) that need no auth check or session refresh:
     *   the forum and its articles, the auth flow pages and the info pages
     *
     * Note: Query strings are automatically stripped by Next.js before matching
     */
    {
      source: '/((?!api/|_next/|favicon.ico|robots.txt|sitemap.xml|manifest.json|sw.js|workbox.*\\.js|site.webmanifest|images/|\\.well-known/.*|health|status|(?:about|api-access|articles|auth/callback|confirm-email|contact|contributors|forum|join-the-team|merch|privacy-policy|reset-password|terms|user-guide)(?:[/.]|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot|otf|pdf|txt|xml|json|map|webmanifest)$).*)',
      // Server actions check auth themselves
      missing: [{ type: 'header', key: 'next-action' }],
    },
    // Starting a forum thread needs the sign-in check
    { source: '/forum/:category/new', missing: [{ type: 'header', key: 'next-action' }] },
    // Forum links from before /page/<n>, for the redirect above
    { source: '/forum/:category/:thread?', has: [{ type: 'query', key: 'page' }] },
  ],
};
