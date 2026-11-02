import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getUserIdFromClaims } from '@/utils/auth';

/**
 * GET /api/fighters/[id]/available-advancements
 * Returns the fighter's characteristic Advancements with their current costs.
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id: fighterId } = await props.params;
  const supabase = await createClient();

  try {
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase.rpc('get_fighter_available_advancements', {
      fighter_id: fighterId
    });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching available advancements:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available advancements' },
      { status: 500 }
    );
  }
}
