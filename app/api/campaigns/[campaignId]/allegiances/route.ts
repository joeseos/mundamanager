import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getCampaignAllegiances } from "@/app/lib/campaigns/[id]/get-campaign-data";
import { getUserIdFromClaims } from "@/utils/auth";

export type { CampaignAllegiance as Allegiance } from "@/utils/campaigns/allegiances";

/**
 * GET /api/campaigns/[campaignId]/allegiances
 * Fetches available allegiances for a campaign (with server-side caching)
 * - For all campaigns: returns both predefined campaign type allegiances (if applicable) and custom campaign allegiances
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ campaignId: string }> }
) {
  const params = await props.params;
  const supabase = await createClient();
  const { campaignId } = params;

  if (!campaignId) {
    return NextResponse.json(
      { error: "Campaign ID is required" },
      { status: 400 }
    );
  }

  try {
    // The allegiances are read over the direct connection, which doesn't check who
    // is asking, so confirm the user first
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allegiances = await getCampaignAllegiances(campaignId);
    return NextResponse.json(allegiances);
  } catch (error) {
    console.error('Error fetching allegiances:', error);
    return NextResponse.json(
      { error: "Failed to fetch allegiances" },
      { status: 500 }
    );
  }
}
