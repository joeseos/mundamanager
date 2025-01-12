import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function PATCH(request: Request) {
  const supabase = createClient();

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

    // Get both current user's role and target user's role
    const [currentUserRole, targetUserRole] = await Promise.all([
      supabase
        .from('campaign_members')
        .select('role')
        .eq('campaign_id', campaignId)
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('campaign_members')
        .select('role')
        .eq('campaign_id', campaignId)
        .eq('user_id', userId)
        .single()
    ]);

    // Check permissions based on roles
    if (currentUserRole.data?.role === 'MEMBER') {
      return NextResponse.json(
        { error: "Members cannot change roles" }, 
        { status: 403 }
      );
    }

    if (currentUserRole.data?.role === 'ARBITRATOR') {
      // Arbitrators can't modify owner's role
      if (targetUserRole.data?.role === 'OWNER') {
        return NextResponse.json(
          { error: "Arbitrators cannot modify the owner's role" }, 
          { status: 403 }
        );
      }
      
      // Arbitrators can only set/unset member role
      if (newRole === 'OWNER') {
        return NextResponse.json(
          { error: "Arbitrators cannot assign owner role" }, 
          { status: 403 }
        );
      }
    }

    // If changing from ARBITRATOR to MEMBER, check if this is the last arbitrator
    if (newRole === 'MEMBER' && targetUserRole.data?.role === 'ARBITRATOR') {
      const { data: arbitratorCount, error: countError } = await supabase
        .from('campaign_members')
        .select('user_id', { count: 'exact' })
        .eq('campaign_id', campaignId)
        .eq('role', 'ARBITRATOR');

      if (countError) throw countError;

      if (arbitratorCount?.length === 1) {
        return NextResponse.json(
          { error: "Cannot remove the last arbitrator from the campaign" }, 
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