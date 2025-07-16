import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { checkAdmin } from "@/utils/auth";

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();

  try {
    console.log('Gang Logs API called for gang ID:', params.id);

    // Get the current user using server-side auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('Auth error:', authError);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('User authenticated:', user.id);

    // Verify the user owns this gang or has access to it
    const { data: gangData, error: gangError } = await supabase
      .from('gangs')
      .select('user_id')
      .eq('id', params.id)
      .single();

    if (gangError) {
      console.error('Gang error:', gangError);
      return NextResponse.json(
        { error: 'Gang not found' },
        { status: 404 }
      );
    }

    console.log('Gang found, user_id:', gangData.user_id);

    // Check if user owns the gang
    const ownsGang = gangData.user_id === user.id;

    // Check if user is OWNER/ARBITRATOR of any campaign containing this gang
    let hasArbitratorAccess = false;
    if (!ownsGang) {
      // First, get all campaigns that contain this gang
      const { data: campaignGangs, error: campaignGangsError } = await supabase
        .from('campaign_gangs')
        .select('campaign_id')
        .eq('gang_id', params.id);

      if (campaignGangsError) {
        console.error('Campaign gangs check error:', campaignGangsError);
      } else if (campaignGangs && campaignGangs.length > 0) {
        const campaignIds = campaignGangs.map(cg => cg.campaign_id);
        console.log('Found campaigns containing this gang:', campaignIds);
        
        // Then check if user is OWNER/ARBITRATOR in any of these campaigns
        const { data: membershipData, error: membershipError } = await supabase
          .from('campaign_members')
          .select('campaign_id, role')
          .eq('user_id', user.id)
          .in('campaign_id', campaignIds)
          .in('role', ['OWNER', 'ARBITRATOR']);

        if (membershipError) {
          console.error('Membership check error:', membershipError);
        } else {
          hasArbitratorAccess = membershipData && membershipData.length > 0;
          console.log('User membership in those campaigns:', membershipData);
          console.log('Has arbitrator access:', hasArbitratorAccess);
        }
      } else {
        console.log('Gang is not in any campaigns');
      }
    }

    // Check if user is admin (admins can access any gang's logs)
    let isAdmin = false;
    if (!ownsGang && !hasArbitratorAccess) {
      isAdmin = await checkAdmin(supabase);
    }

    if (!ownsGang && !hasArbitratorAccess && !isAdmin) {
      console.error('User does not own gang and is not an arbitrator/owner of campaigns containing this gang');
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    console.log('Starting to fetch gang logs...');

    // Fetch gang logs - simplified query without join for now
    const { data: logs, error: logsError } = await supabase
      .from('gang_logs')
      .select('*')
      .eq('gang_id', params.id)
      .order('created_at', { ascending: false })
      .limit(100); // Limit to last 100 logs for performance

    if (logsError) {
      console.error('Error fetching gang logs:', logsError);
      console.error('Error details:', JSON.stringify(logsError, null, 2));
      return NextResponse.json(
        { error: 'Failed to fetch gang logs', details: logsError },
        { status: 500 }
      );
    }

    console.log('Logs fetched successfully, count:', logs?.length || 0);

    // Transform the data - for now just use 'System' as username
    const transformedLogs = logs.map(log => ({
      id: log.id,
      gang_id: log.gang_id,
      user_id: log.user_id,
      action_type: log.action_type,
      description: log.description,
      fighter_id: log.fighter_id,
      created_at: log.created_at,
      username: 'System' // Simplified for now
    }));

    console.log('Returning transformed logs:', transformedLogs.length);

    return NextResponse.json(transformedLogs);

  } catch (error) {
    console.error('Error in gang logs API:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 