import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { checkAdmin, getUserIdFromClaims } from "@/utils/auth";
import { CAMPAIGN_ACTION_TYPES } from "@/utils/log-types";

export async function GET(request: Request, props: { params: Promise<{ campaignId: string }> }) {
  const params = await props.params;
  const supabase = await createClient();

  try {
    const userId = await getUserIdFromClaims(supabase);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: membership, error: membershipError } = await supabase
      .from('campaign_members')
      .select('role')
      .eq('campaign_id', params.campaignId)
      .eq('user_id', userId)
      .in('role', ['OWNER', 'ARBITRATOR', 'MEMBER'])
      .limit(1);

    if (membershipError) {
      console.error('Membership check error:', membershipError);
      return NextResponse.json(
        { error: 'Failed to check membership' },
        { status: 500 }
      );
    }

    const isMember = membership && membership.length > 0;

    if (!isMember) {
      const isAdmin = await checkAdmin(supabase);
      if (!isAdmin) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
        );
      }
    }

    const { data: campaignGangs, error: gangsError } = await supabase
      .from('campaign_gangs')
      .select('gang_id')
      .eq('campaign_id', params.campaignId);

    if (gangsError) {
      console.error('Error fetching campaign gangs:', gangsError);
      return NextResponse.json(
        { error: 'Failed to fetch campaign gangs' },
        { status: 500 }
      );
    }

    const gangIds = campaignGangs?.map(cg => cg.gang_id) || [];

    if (gangIds.length === 0) {
      return NextResponse.json([]);
    }

    const { data: logs, error: logsError } = await supabase
      .from('gang_logs')
      .select('*')
      .in('gang_id', gangIds)
      .in('action_type', [...CAMPAIGN_ACTION_TYPES])
      .order('created_at', { ascending: false })
      .limit(100);

    if (logsError) {
      console.error('Error fetching campaign logs:', logsError);
      return NextResponse.json(
        { error: 'Failed to fetch campaign logs' },
        { status: 500 }
      );
    }

    return NextResponse.json(logs);
  } catch (error) {
    console.error('Error in campaign logs API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
