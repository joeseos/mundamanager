import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { fetchCampaignResources, CampaignResource } from "@/utils/campaigns/resources";

export interface GangResourcesResponse {
  campaign_gang_id: string;
  campaign_id: string;
  campaign_name: string;
  available_resources: CampaignResource[];
  gang_resources: Array<{
    resource_id: string;
    resource_name: string;
    quantity: number;
    is_custom: boolean;
  }>;
}

/**
 * GET /api/gangs/[id]/resources
 * Fetches available resources for a gang's campaign and the gang's current resource quantities.
 * Returns empty array if gang is not in a campaign.
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
    // Get the campaign_gang record to find the campaign
    const { data: campaignGang, error: cgError } = await supabase
      .from('campaign_gangs')
      .select(`
        id,
        campaign_id,
        campaigns!campaign_id (
          id,
          campaign_name,
          campaign_type_id
        )
      `)
      .eq('gang_id', gangId)
      .limit(1)
      .maybeSingle();

    if (cgError) {
      console.error('Error fetching campaign gang:', cgError);
      return NextResponse.json(
        { error: "Failed to fetch campaign information" },
        { status: 500 }
      );
    }

    // If gang is not in a campaign, return empty
    if (!campaignGang || !campaignGang.campaign_id) {
      return NextResponse.json({
        campaign_gang_id: null,
        campaign_id: null,
        campaign_name: null,
        available_resources: [],
        gang_resources: []
      });
    }

    const campaignId = campaignGang.campaign_id;
    const campaignName = (campaignGang.campaigns as any)?.campaign_name || '';

    // Fetch available resources for this campaign (predefined + custom)
    const availableResources = await fetchCampaignResources(campaignId, supabase);

    // Fetch the gang's current resource quantities
    const { data: gangResources, error: grError } = await supabase
      .from('campaign_gang_resources')
      .select(`
        id,
        campaign_type_resource_id,
        campaign_resource_id,
        quantity
      `)
      .eq('campaign_gang_id', campaignGang.id);

    if (grError) {
      console.error('Error fetching gang resources:', grError);
      return NextResponse.json(
        { error: "Failed to fetch gang resources" },
        { status: 500 }
      );
    }

    // Map gang resources to include resource names
    const resourcesWithNames = (gangResources || []).map((gr: any) => {
      const resourceId = gr.campaign_type_resource_id || gr.campaign_resource_id;
      const isCustom = !!gr.campaign_resource_id;
      
      // Find the resource name from available resources
      const resourceInfo = availableResources.find(r => r.id === resourceId);
      
      return {
        resource_id: resourceId,
        resource_name: resourceInfo?.resource_name || 'Unknown',
        quantity: Number(gr.quantity) || 0,
        is_custom: isCustom
      };
    });

    const response: GangResourcesResponse = {
      campaign_gang_id: campaignGang.id,
      campaign_id: campaignId,
      campaign_name: campaignName,
      available_resources: availableResources,
      gang_resources: resourcesWithNames
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error fetching gang resources:', error);
    
    return NextResponse.json(
      { error: "Failed to fetch gang resources" },
      { status: 500 }
    );
  }
}
