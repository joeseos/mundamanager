import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getUserIdFromClaims } from "@/utils/auth";

export async function PATCH(request: Request) {
  const supabase = await createClient();

  try {
    const { campaignId, userId, newRole } = await request.json();

    // Get the authenticated user
    const requesterId = await getUserIdFromClaims(supabase);

    if (!requesterId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if the user making the request is the OWNER
    const { data: requesterRoles } = await supabase
      .from('campaign_members')
      .select('role')
      .eq('campaign_id', campaignId)
      .eq('user_id', requesterId);

    const isOwner = requesterRoles?.some((row: { role: string }) => row.role === 'OWNER');
    if (!isOwner) {
      return NextResponse.json(
        { error: "Only the campaign owner can change roles" },
        { status: 403 }
      );
    }

    // Get the current role before updating
    const { data: currentRoleData } = await supabase
      .from('campaign_members')
      .select('role')
      .eq('campaign_id', campaignId)
      .eq('user_id', userId)
      .single();

    const previousRole = currentRoleData?.role;

    // Update the role
    const { data, error } = await supabase
      .from('campaign_members')
      .update({ role: newRole })
      .eq('campaign_id', campaignId)
      .eq('user_id', userId)
      .select();

    if (error) throw error;

    // If demoting from ARBITRATOR/OWNER to MEMBER, cleanup custom_shared records
    if ((previousRole === 'ARBITRATOR' || previousRole === 'OWNER') && newRole === 'MEMBER') {
      await supabase
        .from('custom_shared')
        .delete()
        .eq('user_id', userId)
        .eq('campaign_id', campaignId);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating member role:', error);
    return NextResponse.json(
      { error: "Failed to update member role" }, 
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();

  try {
    const { campaignId, memberId } = await request.json();

    // Get the authenticated user
    const requesterId = await getUserIdFromClaims(supabase);
    if (!requesterId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if the user making the request is an OWNER
    const { data: requesterRoles } = await supabase
      .from('campaign_members')
      .select('role')
      .eq('campaign_id', campaignId)
      .eq('user_id', requesterId);

    const isOwner = requesterRoles?.some((row: { role: string }) => row.role === 'OWNER');
    if (!isOwner) {
      return NextResponse.json(
        { error: "Only the campaign owner can remove members" },
        { status: 403 }
      );
    }

    // Get the role and user_id of the member to be removed
    const { data: memberRows } = await supabase
      .from('campaign_members')
      .select('role, user_id')
      .eq('campaign_id', campaignId)
      .eq('id', memberId);

    const memberRole = memberRows?.[0]?.role;
    const memberUserId = memberRows?.[0]?.user_id;

    if (memberRole === 'OWNER') {
      // Count how many OWNERs are left
      const { count: ownerCount } = await supabase
        .from('campaign_members')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId)
        .eq('role', 'OWNER');

      if ((ownerCount ?? 0) <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the last owner of the campaign" },
          { status: 403 }
        );
      }
    }

    // Cleanup custom_shared records for this user in this campaign
    if (memberUserId) {
      await supabase
        .from('custom_shared')
        .delete()
        .eq('user_id', memberUserId)
        .eq('campaign_id', campaignId);
    }

    // Proceed to delete the member by memberId
    const { error } = await supabase
      .from('campaign_members')
      .delete()
      .eq('id', memberId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing member:', error);
    return NextResponse.json(
      { error: "Failed to remove member" },
      { status: 500 }
    );
  }
} 