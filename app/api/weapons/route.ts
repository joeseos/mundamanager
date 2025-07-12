import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const runtime = 'edge';
export const preferredRegion = 'auto';
export const dynamic = 'force-dynamic';

const CACHE_MAX_AGE = 3600;

export async function GET() {
  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: weapons, error } = await supabase
      .from('weapons')
      .select('id, weapon_name, cost')
      .order('weapon_name')
      .limit(100);

    if (error) throw error;

    const response = NextResponse.json(weapons || []);
    response.headers.set(
      'Cache-Control',
      `public, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate`
    );
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch weapons' },
      { status: 500 }
    );
  }
}
