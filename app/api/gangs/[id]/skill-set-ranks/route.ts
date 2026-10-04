import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getUserIdFromClaims } from '@/utils/auth';

/**
 * GET /api/gangs/[id]/skill-set-ranks
 * Returns a Venator gang's ranked Skill Sets, lowest rank first.
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const supabase = await createClient();
  const { id: gangId } = params;

  if (!gangId) {
    return NextResponse.json(
      { error: 'Gang ID is required' },
      { status: 400 }
    );
  }

  try {
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('gang_skill_set_ranks')
      .select('rank, skill_type_id')
      .eq('gang_id', gangId)
      .order('rank');

    if (error) throw error;

    return NextResponse.json(data ?? []);
  } catch (error) {
    console.error('Error fetching gang skill set ranks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch gang skill set ranks' },
      { status: 500 }
    );
  }
}
