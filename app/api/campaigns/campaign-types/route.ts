import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();

  try {
    console.log('Fetching campaign types...');
    
    const { data: campaignTypes, error } = await supabase
      .from('campaign_types')
      .select('id, campaign_type_name');

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    const transformedTypes = campaignTypes.map(type => ({
      campaign_type_id: type.id,
      campaign_type: type.campaign_type_name
    }));

    //console.log('Campaign types fetched:', transformedTypes);
    return NextResponse.json(transformedTypes)
  } catch (error) {
    console.error('Error fetching campaign types:', error)
    return NextResponse.json({ error: 'Error fetching campaign types' }, { status: 500 })
  }
} 