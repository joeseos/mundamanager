import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { cookies } from 'next/headers';

// This endpoint will only return minimal data for the dropdown
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = cookies();
    const supabase = createClient();

    // Get the authenticated user securely
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // First get the gang's alignment and verify ownership
    const { data: gangData, error: gangError } = await supabase
      .from('gangs')
      .select('alignment, user_id')
      .eq('id', params.id)
      .single();

    if (gangError) {
      return NextResponse.json({ error: 'Failed to fetch gang data' }, { status: 500 });
    }

    // Verify gang ownership
    if (gangData.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Only fetch the minimal data needed for the dropdown
    const { data: additions, error: additionsError } = await supabase
      .from('gang_additions')
      .select(`
        id,
        gang_addition_name,
        fighter_class,
        cost,
        gang_availability
      `)
      .or(`alignment.eq.${gangData.alignment},alignment.is.null`);

    if (additionsError) {
      console.error('Error fetching additions:', additionsError);
      return NextResponse.json({ error: 'Failed to fetch gang additions' }, { status: 500 });
    }

    // Map gang_availability to max_count in the response
    const formattedAdditions = additions.map(addition => ({
      ...addition,
      max_count: addition.gang_availability
    }));

    return NextResponse.json(formattedAdditions);
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 