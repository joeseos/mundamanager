import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  // List of paths that don't require authentication
  const publicPaths = [
    '/sign-in',
    '/sign-up',
    '/auth/callback',
    '/reset-password',
    '/reset-password/update',
    '/user-guide',
    '/about',
    '/contributors',
    '/join-the-team',
    '/terms',
    '/contact',
    '/privacy-policy'
  ];

  // Check for password reset flow
  const isPasswordResetFlow =
    request.nextUrl.pathname.startsWith('/reset-password') ||
    request.nextUrl.pathname.startsWith('/auth/callback');

  // Early return for public paths - avoid creating Supabase client unnecessarily
  if (publicPaths.includes(request.nextUrl.pathname) || isPasswordResetFlow) {
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
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;

  // For unauthenticated users accessing root, rewrite to sign-in (server-side, no redirect)
  if (!userId && request.nextUrl.pathname === '/') {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = '/sign-in';
    return NextResponse.rewrite(rewriteUrl);
  }

  // Redirect to sign-in if user is not authenticated
  if (!userId) {
    // Build a clean redirect path: drop common tracking params
    const cleanUrl = request.nextUrl.clone();
    const trackingParams = [
      'fbclid', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'
    ];
    trackingParams.forEach((k) => cleanUrl.searchParams.delete(k));

    const redirectPath = `${cleanUrl.pathname}${cleanUrl.search}`;

    // Append next param to sign-in
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/sign-in';
    redirectUrl.searchParams.set('next', redirectPath);

    const redirectResponse = NextResponse.redirect(redirectUrl);

    // Also set short-lived cookie fallback
    redirectResponse.cookies.set('redirectPath', redirectPath, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 5 // 5 minutes
    });
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - _next/webpack-hmr (hot module reload)
     * - api/ (API routes handle their own auth)
     * - Common static files (favicon, robots, sitemap, manifest)
     * - Service workers (sw.js, workbox-*.js)
     * - Static asset files with extensions (images, fonts, CSS, JS, etc.)
     */
    '/((?!_next/static|_next/image|_next/webpack-hmr|api/|favicon.ico|robots.txt|sitemap.xml|manifest.json|sw.js|workbox|.*\\.(png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|otf|css|js|json|xml|txt|pdf|zip|map|webmanifest)$).*)',
  ],
};