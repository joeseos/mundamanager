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

  // Never run the auth/session logic for speculative prefetch requests.
  //
  // Next.js fires RSC prefetches for in-viewport links *in parallel* with the
  // real page request. If several of those parallel requests reach
  // supabase.auth.getClaims() while the access token needs refreshing, they all
  // try to rotate the *same* refresh token at once. Supabase treats the second
  // use of an already-rotated refresh token as token reuse (a breach signal)
  // and revokes the whole session — silently logging the user out on their next
  // click. This is the root cause of "click a gang -> bounced to /sign-in".
  //
  // A prefetch is speculative, so we return an empty 204 here, BEFORE creating
  // any Supabase client. The real navigation then performs auth and a single,
  // serial token refresh. NB: this check must run before getClaims() — doing it
  // afterwards is too late, the damaging refresh has already happened.
  const isPrefetch =
    request.headers.get('Next-Router-Prefetch') === '1' ||
    request.headers.get('purpose') === 'prefetch' ||
    (request.headers.get('Sec-Purpose')?.includes('prefetch') ?? false);
  if (isPrefetch) {
    return new NextResponse(null, { status: 204 });
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

  // [AUTH-DIAG] TEMPORARY: capture exactly why an authenticated user can get a
  // null claims result on a real (non-prefetch) navigation. Remove once the
  // root cause is confirmed from Vercel function logs.
  if (!userId) {
    const sbCookies = request.cookies.getAll().filter((c) => c.name.startsWith('sb-'));
    console.error('[AUTH-DIAG]', JSON.stringify({
      path: pathname,
      rsc: request.headers.get('rsc'),
      nextRouterPrefetch: request.headers.get('next-router-prefetch'),
      purpose: request.headers.get('purpose'),
      secPurpose: request.headers.get('sec-purpose'),
      stateTreeLen: (request.headers.get('next-router-state-tree') || '').length,
      sbCookies: sbCookies.map((c) => ({ name: c.name, len: c.value.length })),
      sbCookieTotalLen: sbCookies.reduce((n, c) => n + c.value.length, 0),
      claimsError: claimsError
        ? {
            name: (claimsError as { name?: string }).name,
            message: (claimsError as { message?: string }).message,
            status: (claimsError as { status?: number }).status,
            code: (claimsError as { code?: string }).code,
          }
        : null,
    }));
  }

  // For unauthenticated users accessing root, rewrite to sign-in (server-side, no redirect)
  if (!userId && request.nextUrl.pathname === '/') {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = '/sign-in';
    return withRefreshedCookies(response, NextResponse.rewrite(rewriteUrl));
  }

  // Redirect to sign-in if user is not authenticated.
  // The intended destination travels solely in the `next` query param — i.e.
  // in the URL the user actually lands on. We deliberately avoid a cookie
  // fallback: a cookie is shared mutable state that background prefetch/RSC
  // requests can pollute (e.g. a prefetch of /account after sign-out would
  // make the next sign-in land on /account). A query param can't leak across
  // requests like that.
  if (!userId) {
    // Build a clean redirect path: drop common tracking params
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