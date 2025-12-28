import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export interface Allegiance {
  id: string;
  allegiance_name: string;
  is_custom: boolean;
}

/**
 * GET /api/campaigns/[campaignId]/allegiances
 * Fetches available allegiances for a campaign
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
    // First, get the campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('campaign_type_id')
      .eq('id', campaignId)
      .single();

    if (campaignError) {
      if (campaignError.code === 'PGRST116') {
        return NextResponse.json(
          { error: "Campaign not found" },
          { status: 404 }
        );
      }
      throw campaignError;
    }
    
    if (!campaign || !campaign.campaign_type_id) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Get the campaign type to check if it's custom
    const { data: campaignType, error: typeError } = await supabase
      .from('campaign_types')
      .select('campaign_type_name')
      .eq('id', campaign.campaign_type_id)
      .single();

    if (typeError) throw typeError;
    
    const isCustomCampaign = campaignType?.campaign_type_name === 'Custom';

    let allegiances: Allegiance[] = [];

    // Always fetch predefined campaign type allegiances (if not custom campaign)
    if (!isCustomCampaign) {
      const { data: typeAllegiances, error: typeAllegianceError } = await supabase
        .from('campaign_type_allegiances')
        .select('id, allegiance_name')
        .eq('campaign_type_id', campaign.campaign_type_id)
        .order('allegiance_name', { ascending: true });

      if (typeAllegianceError) throw typeAllegianceError;
      
      allegiances = (typeAllegiances || []).map(a => ({
        id: a.id,
        allegiance_name: a.allegiance_name,
        is_custom: false
      }));
    }

    // Always fetch custom campaign allegiances (for all campaign types)
    const { data: customAllegiances, error: customError } = await supabase
      .from('campaign_allegiances')
      .select('id, allegiance_name')
      .eq('campaign_id', campaignId)
      .order('allegiance_name', { ascending: true });

    if (customError) throw customError;
    
    // Add custom allegiances to the list
    const customAllegiancesList = (customAllegiances || []).map(a => ({
      id: a.id,
      allegiance_name: a.allegiance_name,
      is_custom: true
    }));
    
    allegiances = [...allegiances, ...customAllegiancesList];

    return NextResponse.json(allegiances);
  } catch (error) {
    console.error('Error fetching allegiances:', error);
    return NextResponse.json(
      { error: "Failed to fetch allegiances" },
      { status: 500 }
    );
  }
}

