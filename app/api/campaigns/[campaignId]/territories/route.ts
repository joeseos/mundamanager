import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

interface Territory {
  id: string;
  territory_name: string;
}

interface RawCampaignTerritory {
  territory_id: string;
  territories: Territory;
}

interface TransformedCampaignTerritory {
  territory_id: string;
  territory_name: string;
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
        territory_id,
        territories (
          id,
          territory_name
        )
      `)
      .eq('campaign_id', campaignId);

    if (error) throw error;

    // Transform the data to include territory_name directly
    const transformedData: TransformedCampaignTerritory[] = (data || []).map(item => ({
      territory_id: item.territory_id,
      territory_name: item.territories?.territory_name || "Unknown"
    }));

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
      // First get the territory names
      const { data: territories, error: territoriesError } = await supabase
        .from('territories')
        .select('id, territory_name')
        .in('id', territoryIds);

      if (territoriesError) throw territoriesError;

      // Then insert with territory names
      const { error: insertError } = await supabase
        .from('campaign_territories')
        .insert(
          territoryIds.map((territoryId: string) => {
            const territory = territories?.find(t => t.id === territoryId);
            return {
              campaign_id: campaignId,
              territory_id: territoryId,
              territory_name: territory?.territory_name
            };
          })
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