import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

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

    if (gangData.user_id !== user.id) {
      console.error('User does not own gang');
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