import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getUserIdFromClaims } from '@/utils/auth';
import { getGangCore, getGangStash } from '@/app/lib/shared/gang-data';
import { canViewHiddenGang, checkPermission, isArbitrator } from '@/utils/user-permissions';
import { isTradeableStashEquipment, type TradeableStashItem } from '@/utils/campaign-trade-stash';

/**
 * GET /api/gangs/[id]/tradeable-stash
 * Stash equipment this gang can put on a campaign trade. Caller must own the
 * gang or be a campaign arb / admin for it.
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  const supabase = await createClient();
  const { id: gangId } = params;

  if (!gangId) {
    return NextResponse.json({ error: 'Gang ID is required' }, { status: 400 });
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
    const canAct = gang.user_id === userId
      || isArbitrator(await checkPermission(userId, { gangId }));
    if (!canAct) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const stash = await getGangStash(gangId);
    const tradeable = stash.filter(isTradeableStashEquipment);
    if (tradeable.length === 0) {
      return NextResponse.json({ items: [] satisfies TradeableStashItem[] });
    }

    const { data: lockedRows, error: lockedError } = await supabase
      .from('campaign_trade_items')
      .select('fighter_equipment_id')
      .in('fighter_equipment_id', tradeable.map((item) => item.id))
      .eq('locked', true);
    if (lockedError) throw lockedError;

    const lockedIds = new Set(
      (lockedRows ?? [])
        .map((row) => row.fighter_equipment_id)
        .filter((id): id is string => typeof id === 'string')
    );

    const items: TradeableStashItem[] = tradeable
      .filter((item) => !lockedIds.has(item.id))
      .map((item) => ({
        id: item.id,
        equipmentName: item.equipment_name,
      }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error listing stash for equipment trade:', error);
    return NextResponse.json(
      { error: 'Failed to load stash' },
      { status: 500 }
    );
  }
}
