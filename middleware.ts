import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  console.log("Middleware called for path:", request.nextUrl.pathname);

  // List of paths that should skip session handling
  const skipSessionPaths = [
    '/reset-password/update'
  ];

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
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Only check auth for non-skip paths
  let userId: string | undefined;
  if (!skipSessionPaths.includes(request.nextUrl.pathname)) {
    const { data: userResult } = await supabase.auth.getUser();
    userId = userResult?.user?.id;
  }
  console.log("User authenticated:", !!userId);

  // List of paths that don't require authentication
  const publicPaths = [
    '/sign-in', 
    '/sign-up', 
    '/auth/callback', 
    '/reset-password',
    '/reset-password/update'
  ];

  // Check for password reset flow
  const isPasswordResetFlow = 
    request.nextUrl.pathname.startsWith('/reset-password') || 
    request.nextUrl.pathname.startsWith('/auth/callback');

  // Allow access to public paths and password reset flow
  if (publicPaths.includes(request.nextUrl.pathname) || isPasswordResetFlow) {
    return response;
  }

  // Redirect to sign-in if user is not authenticated
  if (!userId) {
    console.log("Redirecting to sign-in page");

    // Build a clean redirect path: drop common tracking params
    const cleanUrl = request.nextUrl.clone();
    const trackingParams = [
      'fbclid', 'gclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'
    ];
    trackingParams.forEach((k) => cleanUrl.searchParams.delete(k));

    const isImage = cleanUrl.pathname.startsWith('/images/');
    const redirectPath = isImage ? '/' : `${cleanUrl.pathname}${cleanUrl.search}`;

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

  console.log("Continuing to requested page");

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api routes that handle their own auth
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico and static assets
     * - images (public images folder)
     * - static assets (fonts, documents, etc.)
     * - Next.js special files (robots, sitemap, manifest, etc.)
     * - development and health check endpoints
     * 
     * This maximizes performance by only running middleware on actual page routes
     * that need authentication handling.
     */
    '/((?!api/(?:fighters|gangs|campaigns|admin|alliances|notifications|search-users|gang-types|fighter-types|weapons|skills|skill-types|gang_variant_types|fighter-weapons|fighter-effects|patreon/webhook|patreon/sync|users)|_next/static|_next/image|favicon.ico|images|site.webmanifest|robots.txt|sitemap.xml|manifest.json|sw.js|workbox-.*\\.js|\\.well-known/.*|health|status|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot|otf|pdf|txt|xml|json)$).*)',
  ],
};
// Testing deployment after Vercel outage - can remove this