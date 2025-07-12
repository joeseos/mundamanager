import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { checkAdmin } from '@/utils/auth';

export async function GET() {
  console.log('Fighter classes API endpoint called');

  const supabase = await createClient();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    console.log('Current user:', user?.id);

    const isAdmin = await checkAdmin(supabase);
    console.log('Is admin check result:', isAdmin);

    if (!isAdmin) {
      console.log('Unauthorized - not an admin');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Simple direct query with error logging
    const { data: fighterClasses, error } = await supabase
      .from('fighter_classes')
      .select('id, class_name')
      .order('class_name');

    console.log('Query result:', { data: fighterClasses, error });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        {
          error: 'Database error',
          details: error.message,
        },
        { status: 500 }
      );
    }

    if (!fighterClasses || fighterClasses.length === 0) {
      console.log('No fighter classes found - check RLS policies');
      return NextResponse.json(
        {
          error: 'No data found',
          details: 'Check RLS policies and table data',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(fighterClasses);
  } catch (error) {
    console.error('Error in GET fighter classes:', error);
    return NextResponse.json(
      {
        error: 'Error fetching fighter classes',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
