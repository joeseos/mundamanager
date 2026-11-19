import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

/**
 * GET /api/gangs/[id]/captives
 * Returns fighters held captive by this gang.
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
    const { data: fighters, error: fightersError } = await supabase
      .from('fighters')
      .select('id, fighter_name, fighter_type, gang_id, captured_by_gang_id')
      .eq('captured', true)
      .eq('captured_by_gang_id', gangId);

    if (fightersError) {
      throw fightersError;
    }

    if (!fighters?.length) {
      return NextResponse.json({ captives: [] });
    }

    const originalGangIds = Array.from(new Set(fighters.map((f) => f.gang_id)));
    const { data: gangs } = await supabase
      .from('gangs')
      .select('id, name')
      .in('id', originalGangIds);

    const gangNameMap = new Map((gangs ?? []).map((g) => [g.id, g.name]));

    const captives = fighters.map((f) => ({
      fighterId: f.id,
      fighterName: f.fighter_name,
      fighterType: f.fighter_type ?? undefined,
      originalGangName: gangNameMap.get(f.gang_id) ?? 'Unknown'
    }));

    return NextResponse.json({ captives });
  } catch (error) {
    console.error('Error fetching gang captives:', error);
    return NextResponse.json(
      { error: 'Failed to fetch gang captives' },
      { status: 500 }
    );
  }
}
