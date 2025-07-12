import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();

  try {
    // Check if user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: gangTypes, error } = await supabase
      .from('gang_types')
      .select('gang_type');

    if (error) throw error;

    return NextResponse.json(gangTypes);
  } catch (error) {
    console.error('Error fetching gang types:', error);
    return NextResponse.json(
      { error: 'Error fetching gang types' },
      { status: 500 }
    );
  }
}
