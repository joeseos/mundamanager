import { NextResponse } from 'next/server';
import { getUserCount } from '@/app/lib/get-stats-user';

/**
 * API endpoint to get user count with caching
 * 
 * This endpoint uses the cached getUserCount function, so it won't hit the database
 * on every request. The cache is automatically revalidated every 24 hours.
 * 
 * Cache-Control headers ensure the response is cached at the edge/CDN level as well.
 */
export async function GET() {
  try {
    const count = await getUserCount();
    
    const response = NextResponse.json({ count });
    
    // Add cache headers for edge/CDN caching
    // s-maxage: Cache at edge for 24 hours
    // stale-while-revalidate: Serve stale content while revalidating
    response.headers.set(
      'Cache-Control',
      'public, s-maxage=86400, stale-while-revalidate=86400'
    );
    
    return response;
  } catch (error) {
    console.error('Error fetching user count:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user count' },
      { status: 500 }
    );
  }
}

