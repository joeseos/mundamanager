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

    // Transform and deduplicate by gang id (same gang can appear multiple times in campaign_gangs)
    const seenGangIds = new Set<string>();
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
      }))
      .filter(g => {
        if (seenGangIds.has(g.id)) return false;
        seenGangIds.add(g.id);
        return true;
      });

    return NextResponse.json(gangs);
  } catch (error) {
    console.error('Error in campaign gangs API:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

