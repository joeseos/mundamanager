import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

interface Territory {
  id: string;
  gang_id: string | null;
  gang_name?: string;
  territory_name: string;
}

interface CampaignTerritory {
  id: string;
  territory_id: string;
  territory_name: string;
  gang_id: string | null;
  gang_name?: string;
}

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
    const { data, error } = await supabase
      .from('campaign_territories')
      .select(`
        territory_name
      `)
      .eq('campaign_id', campaignId);

    if (error) throw error;

    return NextResponse.json(data || []);
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

    // Then get territory names for the selected territories
    if (territoryIds && territoryIds.length > 0) {
      const { data: territories, error: territoriesError } = await supabase
        .from('territories')
        .select('id, territory_name')
        .in('id', territoryIds);

      if (territoriesError) throw territoriesError;

      // Insert territories with their names
      const { error: insertError } = await supabase
        .from('campaign_territories')
        .insert(
          territories?.map((territory) => ({
            campaign_id: campaignId,
            territory_id: territory.id,
            territory_name: territory.territory_name
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