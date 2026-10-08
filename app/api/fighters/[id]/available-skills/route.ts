import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getUserIdFromClaims } from '@/utils/auth';

/**
 * GET /api/fighters/[id]/available-skills
 * Returns get_available_skills for the fighter: every skill, including custom
 * skills, with its availability, access level and acquisition types.
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const supabase = await createClient();
  const { id: fighterId } = params;

  if (!fighterId) {
    return NextResponse.json(
      { error: 'Fighter ID is required' },
      { status: 400 }
    );
  }

  try {
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase.rpc('get_available_skills', {
      fighter_id: fighterId
    });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching available skills:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available skills' },
      { status: 500 }
    );
  }
}
