import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getUserIdFromClaims } from '@/utils/auth';

export async function GET() {
  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all archetypes
    const { data: archetypes, error: archetypesError } = await supabase
      .from('skill_access_archetypes')
      .select('id, name, description, skill_access')
      .order('name');

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

