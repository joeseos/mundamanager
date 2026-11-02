import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getUserIdFromClaims } from '@/utils/auth';

/**
 * GET /api/gangs/[id]/available-equipment
 * Returns the equipment the gang can buy, from get_equipment_detailed_data.
 * Query params map to the function's arguments; id lists are comma-separated.
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id: gangId } = await props.params;
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const text = (name: string) => searchParams.get(name) ?? undefined;
  const flag = (name: string) => (searchParams.has(name) ? searchParams.get(name) === 'true' : undefined);
  const ids = (name: string) => (searchParams.has(name) ? searchParams.get(name)!.split(',').filter(Boolean) : undefined);

  try {
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase.rpc('get_equipment_detailed_data', {
      gang_id: gangId,
      gang_type_id: text('gang_type_id'),
      fighter_type_id: text('fighter_type_id'),
      fighter_id: text('fighter_id'),
      fighter_type_equipment: flag('fighter_type_equipment'),
      equipment_tradingpost: flag('equipment_tradingpost'),
      include_legacy: flag('include_legacy'),
      campaign_trading_post_type_ids: ids('campaign_trading_post_type_ids'),
      campaign_custom_trading_post_ids: ids('campaign_custom_trading_post_ids'),
    });

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching available equipment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available equipment' },
      { status: 500 }
    );
  }
}
