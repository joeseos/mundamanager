import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { getUserIdFromClaims } from "@/utils/auth";

export async function GET() {
  const supabase = await createClient();

  try {
    // Check if user is authenticated
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: fighterClasses, error } = await supabase
      .from('fighter_classes')
      .select('id, class_name')
      .order('class_name');

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({
        error: 'Database error',
        details: error.message
      }, { status: 500 });
    }

    if (!fighterClasses || fighterClasses.length === 0) {
      return NextResponse.json({
        error: 'No data found',
        details: 'No fighter classes available'
      }, { status: 404 });
    }

    return NextResponse.json(fighterClasses);

  } catch (error) {
    console.error('Error in GET fighter classes:', error);
    return NextResponse.json(
      {
        error: 'Error fetching fighter classes',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}