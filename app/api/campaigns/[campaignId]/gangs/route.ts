import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const supabase = await createClient();

  try {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { campaignId } = await params;

    // Get all gangs in the campaign through the campaign_gangs junction table
    const { data: campaignGangs, error } = await supabase
      .from('campaign_gangs')
      .select(`
        gang_id,
        gangs:gang_id (
          id,
          name,
          user_id,
          gang_types:gang_type_id (
            gang_type
          )
        )
      `)
      .eq('campaign_id', campaignId)
      .order('gangs(name)');

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({
        error: 'Database error',
        details: error.message
      }, { status: 500 });
    }

    // Transform the data
    const transformedGangs = campaignGangs
      .filter((cg: any) => cg.gangs) // Filter out any null gangs
      .map((cg: any) => ({
        id: cg.gangs.id,
        gang_name: cg.gangs.name,
        gang_type: cg.gangs.gang_types?.gang_type || 'Unknown',
        user_id: cg.gangs.user_id
      }));

    return NextResponse.json(transformedGangs);

  } catch (error) {
    console.error('Error fetching campaign gangs:', error);
    return NextResponse.json(
      {
        error: 'Error fetching campaign gangs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
