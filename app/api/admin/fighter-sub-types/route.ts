import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";

export async function GET() {
  console.log('Fighter sub-types API endpoint called');

  const supabase = createClient();

  try {
    // Check admin authorization
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      console.log('Unauthorized - not an admin');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Query fighter_sub_types table
    const { data: fighterSubTypes, error } = await supabase
      .from('fighter_sub_types')
      .select('id, sub_type_name')
      .order('sub_type_name');

    console.log('Query result:', { data: fighterSubTypes, error });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ 
        error: 'Database error', 
        details: error.message 
      }, { status: 500 });
    }

    if (!fighterSubTypes || fighterSubTypes.length === 0) {
      console.log('No fighter sub-types found - check RLS policies');
      return NextResponse.json([]); // Return empty array instead of error
    }

    return NextResponse.json(fighterSubTypes);

  } catch (error) {
    console.error('Error in GET fighter sub-types:', error);
    return NextResponse.json(
      { 
        error: 'Error fetching fighter sub-types',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
} 