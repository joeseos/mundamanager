import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createClient();

  // Check if user is authenticated
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { campaignId, gangId, userId } = await request.json();

    if (!campaignId || !gangId || !userId) {
      return NextResponse.json(
        { message: 'Campaign ID, Gang ID, and User ID are required' },
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
        { message: 'This gang is already part of another campaign' },
        { status: 400 }
      );
    }

    // Check if user has permission (is OWNER, ARBITRATOR, or adding their own gang)
    const { data: memberRole, error: roleError } = await supabase
      .from('campaign_members')
      .select('role')
      .eq('campaign_id', campaignId)
      .eq('user_id', user.id)
      .single();

    // Allow if:
    // 1. User is OWNER/ARBITRATOR, or
    // 2. User is adding their own gang (user.id === userId)
    if (
      roleError ||
      !memberRole ||
      (memberRole.role !== 'OWNER' &&
        memberRole.role !== 'ARBITRATOR' &&
        user.id !== userId)
    ) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Add gang to campaign
    const { error: insertError } = await supabase
      .from('campaign_gangs')
      .insert({
        campaign_id: campaignId,
        gang_id: gangId,
        user_id: userId,
        joined_at: new Date().toISOString(),
      });

    if (insertError) throw insertError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error adding gang to campaign:', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to add gang to campaign',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();

  // Get the authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { campaignId, gangId, userId } = await request.json();

    if (!campaignId || !gangId) {
      return NextResponse.json(
        { error: 'Campaign ID and Gang ID are required' },
        { status: 400 }
      );
    }

    // Check if user is admin or removing their own gang
    const { data: memberData } = await supabase
      .from('campaign_members')
      .select('role')
      .eq('campaign_id', campaignId)
      .eq('user_id', user.id)
      .single();

    if (
      user.id !== userId &&
      memberData?.role !== 'OWNER' &&
      memberData?.role !== 'ARBITRATOR'
    ) {
      return NextResponse.json(
        { error: 'Unauthorized to remove gang for other users' },
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
      { error: 'Failed to remove gang from campaign' },
      { status: 500 }
    );
  }
}
