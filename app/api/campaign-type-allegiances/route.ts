import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { getUserIdFromClaims } from "@/utils/auth";

export async function GET() {
  const supabase = await createClient();

  try {
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('campaign_type_allegiances')
      .select('id, allegiance_name, campaign_type_id, campaign_types(campaign_type_name)')
      .order('allegiance_name');

    if (error) throw error;

    const result = (data || []).map((row: any) => ({
      id: row.id,
      allegiance_name: row.allegiance_name,
      campaign_type_id: row.campaign_type_id,
      campaign_type_name: row.campaign_types?.campaign_type_name || 'Unknown',
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching campaign type allegiances:', error);
    return NextResponse.json(
      { error: 'Failed to fetch campaign type allegiances' },
      { status: 500 }
    );
  }
}
