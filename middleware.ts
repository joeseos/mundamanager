import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import { createClient } from "@/utils/supabase/server";

export async function middleware(request: NextRequest) {
  console.log("Middleware called for path:", request.nextUrl.pathname);

  // List of paths that should skip session handling
  const skipSessionPaths = [
    '/reset-password/update'
  ];

  // Only update session for non-skip paths
  const res = skipSessionPaths.includes(request.nextUrl.pathname)
    ? NextResponse.next()
    : await updateSession(request);

  // Check if the user is authenticated
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  console.log("User authenticated:", !!user);

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
    return NextResponse.next();
  }

  // Redirect to sign-in if user is not authenticated
  if (!user) {
    console.log("Redirecting to sign-in page");
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/sign-in';
    const response = NextResponse.redirect(redirectUrl);
    
    const redirectPath = request.nextUrl.pathname.startsWith('/images/') ? '/' : request.nextUrl.pathname;
    response.cookies.set('redirectPath', redirectPath, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 5 // 5 minutes
    });
    return response;
  }

  console.log("Continuing to requested page");

  // Inside the middleware function, after checking user authentication
  if (request.nextUrl.pathname.startsWith('/admin')) {
    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('user_role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.user_role !== 'admin') {
      console.log('Access denied to admin area');
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return res;
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
    '/((?!api/(?:fighters|gangs|campaigns|admin|alliances|notifications|search-users|gang-types|fighter-types|weapons|skills|skill-types|gang_variant_types|fighter-weapons|fighter-effects)|_next/static|_next/image|favicon.ico|images|site.webmanifest|robots.txt|sitemap.xml|manifest.json|sw.js|workbox-.*\\.js|\\.well-known/.*|health|status|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot|otf|pdf|txt|xml|json)$).*)',
  ],
};
