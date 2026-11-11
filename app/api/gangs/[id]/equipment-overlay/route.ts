import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getUserIdFromClaims } from '@/utils/auth';
import { getEquipmentOverlay } from '@/app/lib/equipment-catalogue';

/**
 * GET /api/gangs/[id]/equipment-overlay?fighter_id=
 * The Equipment modal's per-gang data, from get_equipment_overlay. The modal resolves its lists
 * from this and the catalogue files it names (/api/equipment/catalogue/...).
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id: gangId } = await props.params;
  const fighterId = new URL(request.url).searchParams.get('fighter_id') || null;
  const supabase = await createClient();

  try {
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(await getEquipmentOverlay(supabase, gangId, fighterId));
  } catch (error) {
    console.error('Error fetching the equipment overlay:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available equipment' },
      { status: 500 }
    );
  }
}
