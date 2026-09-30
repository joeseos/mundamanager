import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getUserIdFromClaims } from "@/utils/auth";
import { CUSTOM_SHARED_COLUMNS, isCustomSharedItemType } from "@/types/custom-shared";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lists the ids of the campaigns a custom asset is shared to.
 * Query: ?type=<CustomSharedItemType>&id=<item id>
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const id = searchParams.get('id');

  if (!type || !isCustomSharedItemType(type) || !id || !UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "A valid type and id are required" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const userId = await getUserIdFromClaims(supabase);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('custom_shared')
    .select('campaign_id')
    .eq(CUSTOM_SHARED_COLUMNS[type], id);

  if (error) {
    console.error('Error fetching shared campaigns:', error);
    return NextResponse.json(
      { error: "Failed to fetch shared campaigns" },
      { status: 500 }
    );
  }

  const campaignIds = Array.from(new Set((data || []).map(r => r.campaign_id).filter(Boolean)));
  return NextResponse.json(campaignIds);
}
