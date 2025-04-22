import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function PATCH(request: Request) {
  const supabase = await createClient();

  try {
    const { campaignId, userId, newRole } = await request.json();

    // Get the authenticated user
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if the user making the request is the OWNER
    const { data: requesterRole } = await supabase
      .from('campaign_members')
      .select('role')
      .eq('campaign_id', campaignId)
      .eq('user_id', user.id)
      .single();

    if (requesterRole?.role !== 'OWNER') {
      return NextResponse.json(
        { error: "Only the campaign owner can change roles" }, 
        { status: 403 }
      );
    }

    // Update the role
    const { data, error } = await supabase
      .from('campaign_members')
      .update({ role: newRole })
      .eq('campaign_id', campaignId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating member role:', error);
    return NextResponse.json(
      { error: "Failed to update member role" }, 
      { status: 500 }
    );
  }
} 