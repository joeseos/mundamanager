import { createClient } from "@/utils/supabase/server";
import { createMockClient } from "@/utils/supabase/mock-client";
import { NextResponse } from "next/server";

// Add Edge Function configurations
export const runtime = 'edge';
export const dynamic = 'force-dynamic';


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const category = searchParams.get('category');

  console.log('Fetching equipment with filters:', { type, category });

  try {

    const client = createMockClient()
    // const client = createClient();

    if (!client) {
      throw new Error('Failed to initialize client');
    }

    const { data: { session } } = await client.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let result;
    console.log(type?.toLocaleLowerCase(), category, 'type and category');
    if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
      // Using mock client
      let query = client.from('equipment').select();
      if (type) {
        query = query.eq('equipment_type', type.toLowerCase());
      }
      if (category && category !== 'null' && category !== 'undefined') {
        query = query.eq('equipment_category', category);
      }
      result = await query.order('equipment_name', { ascending: true });
      if (!result) throw new Error('No result');
    } else {
      // Using actual Supabase client. This should work. Afaik if i give it an empty string it will act as wildcard?
      const { data, error: fetchError } = await client
        .from('equipment')
        .select('*')
        .eq('equipment_type', type?.toLowerCase() || '')
        .eq('equipment_category', category || '')
        .order('equipment_name', { ascending: true });
      
      if (fetchError) throw fetchError;
      result = { data };
    }

    if ('error' in result && result.error) {
      console.error('Query error:', result.error);
      throw result.error;
    }

    // partial map hopefuly this is ok joe?
    const equipment = (result.data || []).map(item => ({
      equipment_id: item.id || '',
      equipment_name: item.equipment_name || '',
      equipment_type: item.equipment_type || '',
      equipment_category: item.equipment_category || '',
      cost: item.cost || 0,
      weapon_profiles: item.weapon_profiles
    }));

    return NextResponse.json(equipment);
  } catch (error) {
    console.error('Error fetching equipment:', error);
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to fetch equipment' },
      { status: 500 }
    );
  }
} 