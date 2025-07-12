import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gangTypeId = searchParams.get('gang_type_id');

  console.log(
    'Received request for fighter types with gang_type_id:',
    gangTypeId
  );

  if (!gangTypeId) {
    console.log('Error: Gang type ID is required');
    return NextResponse.json(
      { error: 'Gang type ID is required' },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  try {
    // Check if user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: fighterTypes, error } = await supabase
      .from('fighter_types')
      .select(
        `
        id,
        fighter_type, 
        cost
      `
      )
      .eq('gang_type_id', gangTypeId);

    if (error) {
      console.error('Supabase error:', error);
      throw error;
    }

    console.log('Fighter types fetched:', fighterTypes);
    return NextResponse.json(fighterTypes);
  } catch (error) {
    console.error('Error fetching fighter types:', error);
    return NextResponse.json(
      { error: 'Error fetching fighter types' },
      { status: 500 }
    );
  }
}
