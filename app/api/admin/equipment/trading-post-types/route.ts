import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { checkAdmin } from '@/utils/auth';

export async function GET(request: Request) {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('trading_post_types')
      .select('id, trading_post_name')
      .order('trading_post_name');

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching trading post types:', error);
    return NextResponse.json(
      { error: 'Failed to fetch trading post types' },
      { status: 500 }
    );
  }
}
