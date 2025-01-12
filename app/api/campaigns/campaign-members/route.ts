import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function PATCH(request: Request) {
  const supabase = createClient();

  // Get the authenticated user
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { campaignId, userId, newRole } = await request.json();

    if (!campaignId || !userId || !newRole) {
      return NextResponse.json(
        { error: "Campaign ID, User ID and new role are required" }, 
        { status: 400 }
      );
    }

    // Check if the current user is an admin
    const { data: memberData } = await supabase
      .from('campaign_members')
      .select('role')
      .eq('campaign_id', campaignId)
      .eq('user_id', user.id)
      .single();

    if (memberData?.role !== 'ADMIN') {
      return NextResponse.json(
        { error: "Only admins can change roles" }, 
        { status: 403 }
      );
    }

    // If changing from ADMIN to MEMBER, check if this is the last admin
    if (newRole === 'MEMBER') {
      const { data: adminCount, error: countError } = await supabase
        .from('campaign_members')
        .select('user_id', { count: 'exact' })
        .eq('campaign_id', campaignId)
        .eq('role', 'ADMIN');

      if (countError) throw countError;

      if (adminCount?.length === 1) {
        return NextResponse.json(
          { error: "Cannot remove the last admin from the campaign" }, 
          { status: 400 }
        );
      }
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