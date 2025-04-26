import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request, props: { params: Promise<{ campaignId: string }> }) {
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
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (error) throw error;

    return NextResponse.json(data);
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