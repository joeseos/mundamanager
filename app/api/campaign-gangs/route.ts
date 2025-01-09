import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = createClient();

  // Get the authenticated user
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { campaignId, gangId } = await request.json();

    if (!campaignId || !gangId) {
      return NextResponse.json(
        { error: "Campaign ID and Gang ID are required" }, 
        { status: 400 }
      );
    }

    // Insert the gang into campaign_gangs table
    const { data, error } = await supabase
      .from('campaign_gangs')
      .insert([
        { 
          campaign_id: campaignId,
          gang_id: gangId,
        }
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error adding gang to campaign:', error);
    return NextResponse.json(
      { error: "Failed to add gang to campaign" }, 
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const supabase = createClient();

  // Get the authenticated user
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { campaignId, gangId } = await request.json();

    if (!campaignId || !gangId) {
      return NextResponse.json(
        { error: "Campaign ID and Gang ID are required" }, 
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('campaign_gangs')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('gang_id', gangId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing gang from campaign:', error);
    return NextResponse.json(
      { error: "Failed to remove gang from campaign" }, 
      { status: 500 }
    );
  }
} 