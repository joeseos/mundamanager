import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { 
  getCampaignBasic, 
  getCampaignMembers, 
  getCampaignTerritories, 
  getCampaignBattles 
} from "@/app/lib/campaigns/[id]/get-campaign-data";
import { revalidateTag } from 'next/cache';

export async function GET(request: Request, props: { params: Promise<{ campaignId: string }> }) {
  const params = await props.params;
  const { campaignId } = params;

  if (!campaignId) {
    return NextResponse.json(
      { error: "Campaign ID is required" },
      { status: 400 }
    );
  }

  try {
    // Revalidate all relevant campaign cache tags for this campaign
    revalidateTag(`campaign-basic-${campaignId}`);
    revalidateTag(`campaign-members-${campaignId}`);
    revalidateTag(`campaign-territories-${campaignId}`);
    revalidateTag(`campaign-battles-${campaignId}`);
    revalidateTag(`campaign-${campaignId}`);
    // Use the same cached functions as the page
    const [
      campaignBasic,
      campaignMembers,
      campaignTerritories,
      campaignBattles
    ] = await Promise.all([
      getCampaignBasic(campaignId),
      getCampaignMembers(campaignId),
      getCampaignTerritories(campaignId),
      getCampaignBattles(campaignId)
    ]);

    // Return 404 if campaign not found
    if (!campaignBasic) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Combine the data in the same format as the page
    const campaignData = {
      id: campaignBasic.id,
      campaign_name: campaignBasic.campaign_name,
      campaign_type_id: campaignBasic.campaign_type_id,
      campaign_type_name: (campaignBasic.campaign_types as any)?.campaign_type_name || '',
      campaign_type_image_url: (campaignBasic.campaign_types as any)?.image_url || '',
      image_url: campaignBasic.image_url || '',
      status: campaignBasic.status,
      description: campaignBasic.description,
      created_at: campaignBasic.created_at,
      updated_at: campaignBasic.updated_at,
      note: campaignBasic.note,
      trading_posts: campaignBasic.trading_posts || [],
      has_meat: campaignBasic.has_meat,
      has_exploration_points: campaignBasic.has_exploration_points,
      has_scavenging_rolls: campaignBasic.has_scavenging_rolls,
      has_power: campaignBasic.has_power,
      has_sustenance: campaignBasic.has_sustenance,
      has_salvage: campaignBasic.has_salvage,
      members: campaignMembers,
      territories: campaignTerritories,
      battles: campaignBattles
    };

    return NextResponse.json(campaignData);
  } catch (error) {
    console.error('Error fetching campaign:', error);
    return NextResponse.json(
      { error: "Failed to fetch campaign" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ campaignId: string }> }) {
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
    const updates = await request.json();
    
    // Add the updated_at timestamp
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', campaignId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating campaign:', error);
    return NextResponse.json(
      { error: "Failed to update campaign" },
      { status: 500 }
    );
  }
} 