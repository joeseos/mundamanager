import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

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
    // Optional: guarantees this gang is present in the result even if it
    // isn't an ACCEPTED member of the campaign (or when no campaignId is
    // given at all, in which case this is the only gang returned). Used by
    // the fighter OOA / Add XP target pickers, which need the fighter's own
    // gang available as a target.
    const gangId = searchParams.get('gangId');
    // Optional: attaches each gang's fighters (id, name, type, class) for
    // the same target pickers.
    const includeFighters = searchParams.get('includeFighters') === 'true';

    if (!campaignId && !gangId) {
      return NextResponse.json(
        { error: "campaignId or gangId is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    let campaignGangs: CampaignGangWithGang[] = [];

    if (campaignId) {
      // Single optimized query: get campaign gangs with gangs and profiles joined
      // Only show ACCEPTED gangs (PENDING gangs require approval first)
      const { data, error: campaignGangsError } = await supabase
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
      campaignGangs = data || [];
    }

    if (gangId && !campaignGangs.some(cg => cg.gang_id === gangId)) {
      const { data: ownGang, error: ownGangError } = await supabase
        .from('gangs')
        .select('id, name, gang_type, gang_colour, user_id')
        .eq('id', gangId)
        .maybeSingle();

      if (ownGangError) {
        console.error('Error fetching own gang:', ownGangError);
        return NextResponse.json(
          { error: "Failed to fetch gang" },
          { status: 500 }
        );
      }

      if (ownGang) {
        campaignGangs.push({
          id: '',
          gang_id: ownGang.id,
          user_id: ownGang.user_id,
          campaign_member_id: null,
          gangs: {
            id: ownGang.id,
            name: ownGang.name,
            gang_type: ownGang.gang_type,
            gang_colour: ownGang.gang_colour,
          },
        });
      }
    }

    if (campaignGangs.length === 0) {
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
        campaign_gang_id: cg.id || null,
        user_id: cg.user_id,
        campaign_member_id: cg.campaign_member_id,
        owner_username: (cg.user_id && profileMap.get(cg.user_id)) || 'Unknown'
      }))
      .filter(g => {
        if (seenGangIds.has(g.id)) return false;
        seenGangIds.add(g.id);
        return true;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (!includeFighters) {
      return NextResponse.json(gangs);
    }

    const gangIds = gangs.map(g => g.id);
    const { data: fighters, error: fightersError } = await supabase
      .from('fighters')
      .select('id, fighter_name, fighter_type, fighter_class, gang_id')
      .in('gang_id', gangIds)
      .order('fighter_name', { ascending: true });

    if (fightersError) {
      console.error('Error fetching gang fighters:', fightersError);
      return NextResponse.json(
        { error: "Failed to fetch gang fighters" },
        { status: 500 }
      );
    }

    const fightersByGang = new Map<string, Array<{ id: string; fighter_name: string; fighter_type: string | null; fighter_class: string | null; gang_id: string }>>();
    (fighters || []).forEach((f: any) => {
      if (!fightersByGang.has(f.gang_id)) fightersByGang.set(f.gang_id, []);
      fightersByGang.get(f.gang_id)!.push({
        id: f.id,
        fighter_name: f.fighter_name,
        fighter_type: f.fighter_type ?? null,
        fighter_class: f.fighter_class ?? null,
        gang_id: f.gang_id,
      });
    });

    const gangsWithFighters = gangs.map(g => ({
      ...g,
      fighters: fightersByGang.get(g.id) || [],
    }));

    return NextResponse.json(gangsWithFighters);
  } catch (error) {
    console.error('Error in campaign gangs API:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
