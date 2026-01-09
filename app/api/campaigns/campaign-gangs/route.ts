import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getUserIdFromClaims } from "@/utils/auth";

type CampaignGangWithGang = {
  id: string;
  gang_id: string;
  user_id: string | null;
  campaign_member_id: string | null;
  gangs: {
    id: string;
    name: string;
    gang_type: string;
    gang_colour: string | null;
  };
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId');

    if (!campaignId) {
      return NextResponse.json(
        { error: "Campaign ID is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Single optimized query: get campaign gangs with gangs and profiles joined
    // Only show ACCEPTED gangs (PENDING gangs require approval first)
    const { data: campaignGangs, error: campaignGangsError } = await supabase
      .from('campaign_gangs')
      .select(`
        id,
        gang_id,
        user_id,
        campaign_member_id,
        gangs!inner(id, name, gang_type, gang_colour)
      `)
      .eq('campaign_id', campaignId)
      .eq('status', 'ACCEPTED')
      .returns<CampaignGangWithGang[]>();

    if (campaignGangsError) {
      console.error('Error fetching campaign gangs:', campaignGangsError);
      return NextResponse.json(
        { error: "Failed to fetch campaign gangs" },
        { status: 500 }
      );
    }

    if (!campaignGangs || campaignGangs.length === 0) {
      return NextResponse.json([]);
    }

    // Extract unique user IDs and fetch profiles
    const userIds = Array.from(new Set(
      campaignGangs
        .map(cg => cg.user_id)
        .filter((id): id is string => Boolean(id))
    ));

    let userProfiles: { id: string; username: string }[] = [];
    if (userIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);

      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        // Don't fail the request if profiles can't be fetched
      } else if (profiles) {
        userProfiles = profiles;
      }
    }

    // Create a map for quick profile lookup
    const profileMap = new Map(userProfiles.map(p => [p.id, p.username]));

    // Transform the data into the format needed by the modal
    const gangs = campaignGangs
      .filter(cg => cg.gangs) // Filter out any entries without gang data
      .map(cg => ({
        id: cg.gangs.id,
        name: cg.gangs.name,
        gang_type: cg.gangs.gang_type,
        gang_colour: cg.gangs.gang_colour,
        campaign_gang_id: cg.id,
        user_id: cg.user_id,
        campaign_member_id: cg.campaign_member_id,
        owner_username: (cg.user_id && profileMap.get(cg.user_id)) || 'Unknown'
      }));

    return NextResponse.json(gangs);
  } catch (error) {
    console.error('Error in campaign gangs API:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();

  // Check if user is authenticated
  const requesterId = await getUserIdFromClaims(supabase);
  if (!requesterId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { campaignId, gangId, userId } = await request.json();

    if (!campaignId || !gangId || !userId) {
      return NextResponse.json(
        { message: "Campaign ID, Gang ID, and User ID are required" },
        { status: 400 }
      );
    }

    // Check if gang is already in any campaign
    const { data: existingGang, error: checkError } = await supabase
      .from('campaign_gangs')
      .select('campaign_id')
      .eq('gang_id', gangId)
      .single();

    if (existingGang) {
      return NextResponse.json(
        { message: "This gang is already part of another campaign" },
        { status: 400 }
      );
    }

    // Check if user has permission (is OWNER, ARBITRATOR, or adding their own gang)
    const { data: memberRole, error: roleError } = await supabase
      .from('campaign_members')
      .select('role')
      .eq('campaign_id', campaignId)
      .eq('user_id', requesterId)
      .single();

    // Allow if:
    // 1. User is OWNER/ARBITRATOR, or
    // 2. User is adding their own gang (requesterId === userId)
    if (roleError || !memberRole ||
        (memberRole.role !== 'OWNER' &&
         memberRole.role !== 'ARBITRATOR' &&
         requesterId !== userId)) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    // Add gang to campaign
    const { error: insertError } = await supabase
      .from('campaign_gangs')
      .insert({
        campaign_id: campaignId,
        gang_id: gangId,
        user_id: userId
      });

    if (insertError) throw insertError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error adding gang to campaign:', error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to add gang to campaign" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();

  // Get the authenticated user
  const requesterId = await getUserIdFromClaims(supabase);

  if (!requesterId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { campaignId, gangId, userId } = await request.json();

    if (!campaignId || !gangId) {
      return NextResponse.json(
        { error: "Campaign ID and Gang ID are required" }, 
        { status: 400 }
      );
    }

    // Check if user is admin or removing their own gang
    const { data: memberData } = await supabase
      .from('campaign_members')
      .select('role')
      .eq('campaign_id', campaignId)
      .eq('user_id', requesterId)
      .single();

    if (requesterId !== userId && memberData?.role !== 'OWNER' && memberData?.role !== 'ARBITRATOR') {
      return NextResponse.json(
        { error: "Unauthorized to remove gang for other users" },
        { status: 403 }
      );
    }

    const { error } = await supabase
      .from('campaign_gangs')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('gang_id', gangId)
      .eq('user_id', userId);

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