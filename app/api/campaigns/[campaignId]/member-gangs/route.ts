import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getCampaignMemberGangs } from "@/app/lib/campaigns/[id]/get-campaign-data";
import { getUserIdFromClaims } from "@/utils/auth";

/**
 * GET /api/campaigns/[campaignId]/member-gangs?userId=...
 * The member's gangs of the campaign's edition, for the Add Gang picker.
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ campaignId: string }> }
) {
  const { campaignId } = await props.params;
  const memberUserId = new URL(request.url).searchParams.get('userId');
  if (!memberUserId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    // The gangs are read over the direct connection, which doesn't check who
    // is asking, so confirm the user first
    if (!await getUserIdFromClaims(supabase)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(await getCampaignMemberGangs(campaignId, memberUserId));
  } catch (error) {
    console.error('Error fetching member gangs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch member gangs' },
      { status: 500 }
    );
  }
}
