import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getGangBattleLogs } from "@/app/lib/campaigns/[id]/get-campaign-data";
import { getUserIdFromClaims } from "@/utils/auth";

/**
 * GET /api/gangs/[id]/battle-logs
 * The gang's played battles in all its campaigns, for the gang page's Campaign tab.
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id: gangId } = await props.params;
  const supabase = await createClient();

  try {
    // The battles are read over the direct connection, which doesn't check who
    // is asking, so confirm the user first
    if (!await getUserIdFromClaims(supabase)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(await getGangBattleLogs(gangId));
  } catch (error) {
    console.error('Error fetching gang battle logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch gang battle logs' },
      { status: 500 }
    );
  }
}
