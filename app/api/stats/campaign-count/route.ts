import { NextResponse } from 'next/server';
import { getCampaignCount } from '@/app/lib/get-stats-campaign';

/**
 * API endpoint to get campaign count with caching
 * 
 * This endpoint uses the cached getCampaignCount function, so it won't hit the database
 * on every request. The cache is automatically revalidated every 24 hours.
 * 
 * Cache-Control headers ensure the response is cached at the edge/CDN level as well.
 */
export async function GET() {
  try {
    const count = await getCampaignCount();
    
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
    console.error('Error fetching campaign count:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaign count' },
      { status: 500 }
    );
  }
}

