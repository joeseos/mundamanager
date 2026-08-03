import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { checkAdmin } from "@/utils/auth";

export async function GET() {

  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);

    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // fighter_classes holds one row per class per edition; clients filter by
    // edition_id so same-named classes across editions stay distinguishable
    const { data: fighterClasses, error } = await supabase
      .from('fighter_classes')
      .select('id, class_name, edition_id')
      .order('class_name');

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json({ 
        error: 'Database error', 
        details: error.message 
      }, { status: 500 });
    }

    // An empty list is a valid answer, not an error
    return NextResponse.json(fighterClasses ?? []);

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
