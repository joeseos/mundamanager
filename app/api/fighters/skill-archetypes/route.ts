import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getUserIdFromClaims } from '@/utils/auth';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const fighterClassId = searchParams.get('fighter_class_id');

    // Get archetypes, filtered by fighter class if provided
    let query = supabase
      .from('skill_access_archetypes')
      .select('id, name, description, skill_access, fighter_class_id')
      .order('name');

    if (fighterClassId) {
      query = query.or(`fighter_class_id.is.null,fighter_class_id.eq.${fighterClassId}`);
    }

    const { data: archetypes, error: archetypesError } = await query;

    if (archetypesError) {
      console.error('Error fetching archetypes:', archetypesError);
      return NextResponse.json(
        { error: 'Failed to fetch archetypes' },
        { status: 500 }
      );
    }

    return NextResponse.json({ archetypes: archetypes || [] });

  } catch (error) {
    console.error('Error in GET /api/fighters/skill-archetypes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch archetypes' },
      { status: 500 }
    );
  }
}

