import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getCampaignAllegiances } from "@/app/lib/campaigns/[id]/get-campaign-data";

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
    const allegiances = await getCampaignAllegiances(campaignId, supabase);
    return NextResponse.json(allegiances);
  } catch (error: any) {
    console.error('Error fetching allegiances:', error);
    
    // Handle specific error cases
    if (error?.code === 'PGRST116' || error?.message === 'Campaign not found') {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to fetch allegiances" },
      { status: 500 }
    );
  }
}
