import { NextResponse } from 'next/server';
import { getGangCount } from '@/app/lib/get-stats-gang';

/**
 * API endpoint to get gang count with caching
 * 
 * This endpoint uses the cached getGangCount function, so it won't hit the database
 * on every request. The cache is automatically revalidated every 24 hours.
 * 
 * Cache-Control headers ensure the response is cached at the edge/CDN level as well.
 */
export async function GET() {
  try {
    const count = await getGangCount();
    
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
    console.error('Error fetching gang count:', error);
    return NextResponse.json(
      { error: 'Failed to fetch gang count' },
      { status: 500 }
    );
  }
}

