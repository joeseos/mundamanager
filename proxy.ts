import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { getUserIdFromClaims } from './utils/auth'

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
      return NextResponse.redirect(new URL('/', request.url));
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

  // Check authentication
  const userId = await getUserIdFromClaims(supabase);

  // For unauthenticated users accessing root, rewrite to sign-in (server-side, no redirect)
  if (!userId && request.nextUrl.pathname === '/') {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = '/sign-in';
    return NextResponse.rewrite(rewriteUrl);
  }

  // Redirect to sign-in if user is not authenticated.
  // The intended destination travels solely in the `next` query param — i.e.
  // in the URL the user actually lands on. We deliberately avoid a cookie
  // fallback: a cookie is shared mutable state that background prefetch/RSC
  // requests can pollute (e.g. a prefetch of /account after sign-out would
  // make the next sign-in land on /account). A query param can't leak across
  // requests like that.
  if (!userId) {
    // Never redirect a prefetch request. Next.js fires speculative RSC
    // prefetches for links in the viewport; if the optimistic auth check here
    // misses (e.g. a transient claims read during token refresh), redirecting
    // makes Next cache "this link -> /sign-in" and replay it when the user
    // actually clicks — spuriously logging them out. Returning an empty 204
    // lets the prefetch resolve to nothing; the real click then performs a
    // fresh navigation that is auth-checked normally.
    const isPrefetch =
      request.headers.get('Next-Router-Prefetch') === '1' ||
      request.headers.get('purpose') === 'prefetch' ||
      (request.headers.get('Sec-Purpose')?.includes('prefetch') ?? false);
    if (isPrefetch) {
      return new NextResponse(null, { status: 204 });
    }

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

    return NextResponse.redirect(redirectUrl);
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