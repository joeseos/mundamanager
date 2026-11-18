import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getUserIdFromClaims } from '@/utils/auth';
import { getGangCore } from '@/app/lib/shared/gang-data';
import { canViewHiddenGang } from '@/utils/user-permissions';

/**
 * GET /api/gangs/[id]/captives
 * Returns fighters held captive by this gang. Any viewer who can see the gang
 * (including Campaign tab visitors) can read the list.
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

    const gang = await getGangCore(gangId);
    if (!gang) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!(await canViewHiddenGang(userId, gangId, gang.user_id, gang.hidden))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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

    const originalGangIds = Array.from(new Set(fighters.map((f) => f.gang_id).filter(Boolean)));
    const { data: gangs } = originalGangIds.length > 0
      ? await supabase
          .from('gangs')
          .select('id, name')
          .in('id', originalGangIds)
      : { data: [] as { id: string; name: string }[] };

    const gangById = new Map((gangs ?? []).map((g) => [g.id, g]));

    const captives = fighters.map((f) => {
      const originalGang = f.gang_id ? gangById.get(f.gang_id) : undefined;
      return {
        fighterId: f.id,
        fighterName: f.fighter_name,
        fighterType: f.fighter_type ?? undefined,
        originalGangId: f.gang_id ?? null,
        originalGangName: originalGang?.name ?? 'Unknown',
      };
    });

    return NextResponse.json({ captives });
  } catch (error) {
    console.error('Error fetching gang captives:', error);
    return NextResponse.json(
      { error: 'Failed to fetch gang captives' },
      { status: 500 }
    );
  }
}
