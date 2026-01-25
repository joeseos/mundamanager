import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getCampaignResources } from "@/app/lib/campaigns/[id]/get-campaign-data";

export type { CampaignResource as Resource } from "@/utils/campaigns/resources";

/**
 * GET /api/campaigns/[campaignId]/resources
 * Fetches available resources for a campaign (with server-side caching)
 * - For all campaigns: returns both predefined campaign type resources (if applicable) and custom campaign resources
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
    const resources = await getCampaignResources(campaignId, supabase);
    return NextResponse.json(resources);
  } catch (error: any) {
    console.error('Error fetching resources:', error);
    
    // Handle specific error cases
    if (error?.code === 'PGRST116' || error?.message === 'Campaign not found') {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to fetch resources" },
      { status: 500 }
    );
  }
}
