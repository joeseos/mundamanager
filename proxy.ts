import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getUserIdFromClaims } from './utils/auth'

// Carry any cookies a getClaims() refresh wrote onto `response` over to a
// different response we're about to return (a redirect/rewrite). Per the
// Supabase SSR docs, failing to do this lets a refreshed token get dropped,
// desyncing browser and server and terminating the session prematurely.
function withRefreshedCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip proxy for server actions - they handle their own auth
  if (request.headers.get('Next-Action')) {
    return NextResponse.next();
  }

  // Auth pages - check if user is already logged in and redirect away
  const authPages = ['/sign-in', '/sign-up'];

  if (authPages.includes(pathname)) {
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

    const userId = await getUserIdFromClaims(supabase);

    if (userId) {
      return withRefreshedCookies(response, NextResponse.redirect(new URL('/', request.url)));
    }
    return response;
  }

  // Public pages - accessible to everyone, no auth check
  const publicPaths = [
    '/auth/callback',
    '/reset-password',
    '/reset-password/update',
    '/user-guide',
    '/about',
    '/contributors',
    '/join-the-team',
    '/terms',
    '/contact',
    '/privacy-policy',
    '/merch'
  ];

  // Check for password reset flow
  const isPasswordResetFlow =
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/auth/callback');

  // Early return for public paths - avoid creating Supabase client unnecessarily
  if (publicPaths.includes(pathname) || isPasswordResetFlow) {
    return NextResponse.next({ request });
  }

  // Create response and Supabase client bound to the incoming request/response (Edge-safe)
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

  // Check authentication.
  // NB: call getClaims() directly (instead of getUserIdFromClaims) so the
  // temporary diagnostics below can see the actual error, not just a boolean.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = (claimsData?.claims?.sub as string | undefined) ?? null;

  if (!userId) {
    // Treat RSC and prefetch requests as "speculative" — never redirect them.
    // Detection covers: the `_rsc` query param and `RSC` header (client RSC
    // fetches/prefetches), plus the browser prefetch signals `Sec-Purpose:
    // prefetch`, `Next-Router-Prefetch`, and `purpose: prefetch` (document-level
    // prefetches that arrive with NO `_rsc` and, crucially, sometimes WITHOUT
    // cookies). Only genuine top-level navigations fall through to the redirect.
    const secPurpose = request.headers.get('sec-purpose') || '';
    const isSpeculative =
      request.nextUrl.searchParams.has('_rsc') ||
      request.headers.get('rsc') === '1' ||
      secPurpose.includes('prefetch') ||
      request.headers.get('next-router-prefetch') === '1' ||
      request.headers.get('purpose') === 'prefetch';

    // [AUTH-DIAG] TEMPORARY: log the FULL cookie/header state on any null-claims
    // result — ALL cookie names (not just sb-*) + the raw Cookie header length —
    // so we can see whether the browser sent any cookies at all on the failing
    // request. Echoed to the browser via the `authDiag` param / `x-auth-diag`
    // header. Remove once the fix is confirmed.
    const allCookies = request.cookies.getAll();
    const sbCookies = allCookies.filter((c) => c.name.startsWith('sb-'));
    const diag = {
      path: pathname,
      method: request.method,
      isSpeculative,
      rscHeader: request.headers.get('rsc'),
      hasRscParam: request.nextUrl.searchParams.has('_rsc'),
      secPurpose: request.headers.get('sec-purpose'),
      cookieNames: allCookies.map((c) => c.name),
      cookieCount: allCookies.length,
      cookieHeaderLen: (request.headers.get('cookie') || '').length,
      sbCount: sbCookies.length,
      sbTotalLen: sbCookies.reduce((n, c) => n + c.value.length, 0),
      claimsError: claimsError
        ? { name: (claimsError as { name?: string }).name, message: (claimsError as { message?: string }).message }
        : null,
    };
    console.error('[AUTH-DIAG]', JSON.stringify(diag));

    // Never return a redirect for an RSC / prefetch request. Next.js caches a
    // redirect response for the link and replays it on the user's actual click —
    // so a single cookie-less prefetch (which fails auth here) poisons the link
    // and bounces the user to /sign-in even though they're logged in. Returning
    // 204 caches nothing; Next falls back to a full document navigation on the
    // real click. Genuinely logged-out users still get redirected by the
    // document request below.
    if (isSpeculative) {
      const res = new NextResponse(null, { status: 204 });
      res.headers.set('x-auth-diag', JSON.stringify(diag)); // TEMPORARY
      return res;
    }

    // For unauthenticated users accessing root, rewrite to sign-in (keeps URL as /)
    if (request.nextUrl.pathname === '/') {
      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = '/sign-in';
      return withRefreshedCookies(response, NextResponse.rewrite(rewriteUrl));
    }

    // Document request: redirect to sign-in. The intended destination travels in
    // the `next` query param (the URL the user actually lands on).
    const cleanUrl = request.nextUrl.clone();
    const trackingParams = [
      'fbclid', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'
    ];
    trackingParams.forEach((k) => cleanUrl.searchParams.delete(k));

    const redirectPath = `${cleanUrl.pathname}${cleanUrl.search}`;

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/sign-in';
    redirectUrl.search = '';
    redirectUrl.searchParams.set('next', redirectPath);
    redirectUrl.searchParams.set('authDiag', JSON.stringify(diag)); // TEMPORARY

    return withRefreshedCookies(response, NextResponse.redirect(redirectUrl));
  }

  return response;
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
     *
     * Note: Query strings are automatically stripped by Next.js before matching
     */
    '/((?!api/|_next/|favicon.ico|robots.txt|sitemap.xml|manifest.json|sw.js|workbox.*\\.js|site.webmanifest|images/|\\.well-known/.*|health|status|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot|otf|pdf|txt|xml|json|map|webmanifest)$).*)',
  ],
};