import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getGangFighterStats } from "@/app/lib/shared/gang-data";
import { getUserIdFromClaims } from "@/utils/auth";

/**
 * GET /api/gangs/[id]/stats
 * Fetches aggregated fighter stats for a gang (OOA caused, deaths suffered)
 * with server-side caching via unstable_cache.
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const supabase = await createClient();
  const { id: gangId } = params;

  if (!gangId) {
    return NextResponse.json(
      { error: "Gang ID is required" },
      { status: 400 }
    );
  }

  try {
    // getGangFighterStats caches per gang across users. Without a session, RLS
    // returns no fighters, which would be cached as a zero "OOA caused".
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stats = await getGangFighterStats(gangId, supabase);
    return NextResponse.json(stats);
  } catch (error: any) {
    console.error('Error fetching gang fighter stats:', error);

    return NextResponse.json(
      { error: "Failed to fetch gang fighter stats" },
      { status: 500 }
    );
  }
}
