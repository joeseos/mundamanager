import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const supabase = createClient();
  const { campaignId } = params;

  if (!campaignId) {
    return NextResponse.json(
      { error: "Campaign ID is required" },
      { status: 400 }
    );
  }

  try {
    // First get all territories for this campaign
    const { data: campaignTerritories, error: campaignError } = await supabase
      .from('campaign_territories')
      .select('territory_id')
      .eq('campaign_id', campaignId);

    if (campaignError) throw campaignError;

    if (!campaignTerritories || campaignTerritories.length === 0) {
      return NextResponse.json([]);
    }

    // Then get the territory details
    const territoryIds = campaignTerritories.map(ct => ct.territory_id);
    const { data: territories, error: territoriesError } = await supabase
      .from('territories')
      .select('id, territory_name')
      .in('id', territoryIds);

    if (territoriesError) throw territoriesError;

    // Transform the data to match the expected format
    const transformedData = territories?.map(territory => ({
      territory_id: territory.id,
      territory_name: territory.territory_name
    })) || [];

    return NextResponse.json(transformedData);
  } catch (error) {
    console.error('Error fetching territories:', error);
    return NextResponse.json(
      { error: "Failed to fetch campaign territories" }, 
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  const supabase = createClient();
  const { campaignId } = params;

  if (!campaignId) {
    return NextResponse.json(
      { error: "Campaign ID is required" },
      { status: 400 }
    );
  }

  try {
    const { territoryIds } = await request.json();

    // First delete existing territories for this campaign
    const { error: deleteError } = await supabase
      .from('campaign_territories')
      .delete()
      .eq('campaign_id', campaignId);

    if (deleteError) throw deleteError;

    // Then insert the new ones
    if (territoryIds && territoryIds.length > 0) {
      const { error: insertError } = await supabase
        .from('campaign_territories')
        .insert(
          territoryIds.map((territoryId: string) => ({
            campaign_id: campaignId,
            territory_id: territoryId
          }))
        );

      if (insertError) throw insertError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving territories:', error);
    return NextResponse.json(
      { error: "Failed to save campaign territories" }, 
      { status: 500 }
    );
  }
} 