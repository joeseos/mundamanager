import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gangTypeId = searchParams.get('gang_type_id');
  const isGangAddition = searchParams.get('is_gang_addition') === 'true';

  console.log('Received request for fighter types with gang_type_id:', gangTypeId, 'isGangAddition:', isGangAddition);

  if (!gangTypeId) {
    console.log('Error: Gang type ID is required');
    return NextResponse.json({ error: 'Gang type ID is required' }, { status: 400 });
  }

  const supabase = await createClient();

  try {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let data;
    
    if (isGangAddition) {
      // Use get_fighter_types_with_cost for gang additions (same as server action)
      const { data: result, error } = await supabase.rpc('get_fighter_types_with_cost', {
        p_gang_type_id: gangTypeId,
        p_is_gang_addition: true
      });
      
      if (error) {
        console.error('Supabase RPC error:', error);
        throw error;
      }
      
      data = result;
    } else {
      // Use get_add_fighter_details for regular fighters (same as server action)
      const { data: result, error } = await supabase.rpc('get_add_fighter_details', {
        p_gang_type_id: gangTypeId
      });
      
      if (error) {
        console.error('Supabase RPC error:', error);
        throw error;
      }
      
      data = result;
    }

    console.log('Fighter types fetched:', data);
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching fighter types:', error);
    return NextResponse.json({ error: 'Error fetching fighter types' }, { status: 500 });
  }
}
