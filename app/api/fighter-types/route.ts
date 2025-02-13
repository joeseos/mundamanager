import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gangTypeId = searchParams.get('gang_type_id');
  const isGangAddition = searchParams.get('is_gang_addition') === 'true';

  console.log('Received request for fighter types with gang_type_id:', gangTypeId);

  if (!gangTypeId && !isGangAddition) {
    console.log('Error: Gang type ID is required for non-gang additions');
    return NextResponse.json({ error: 'Gang type ID is required' }, { status: 400 });
  }

  const supabase = createClient();

  try {
    let query;
    if (isGangAddition) {
      // For gang additions, query directly since they might have null gang_type_id
      const { data: fighterTypes, error } = await supabase
        .from('fighter_types')
        .select('*')
        .eq('is_gang_addition', true);

      if (error) throw error;
      query = { data: fighterTypes, error };
    } else {
      // For regular fighters, use the RPC
      query = await supabase
        .rpc('get_fighter_types_with_cost', {
          p_gang_type_id: gangTypeId
        });
    }

    if (query.error) {
      console.error('Supabase error:', query.error);
      throw query.error;
    }

    // Format the response to match the expected interface
    const formattedTypes = query.data.map((type: any) => ({
      id: type.id,
      fighter_type_id: type.id,
      fighter_type: type.fighter_type,
      fighter_class: type.fighter_class,
      cost: type.cost,
      total_cost: type.total_cost || type.cost, // fallback to cost if total_cost not available
      special_rules: type.special_rules
    }));

    return NextResponse.json(formattedTypes);
  } catch (error) {
    console.error('Error fetching fighter types:', error);
    return NextResponse.json({ error: 'Error fetching fighter types' }, { status: 500 });
  }
}
