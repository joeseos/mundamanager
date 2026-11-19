import { createClient } from '@/utils/supabase/server';

export const EQUIPMENT_LOCKED_IN_TRADE = 'This item is listed in an open campaign trade.';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function equipmentLockedInTrade(
  supabase: SupabaseClient,
  fighterEquipmentIds: string[]
): Promise<boolean> {
  if (fighterEquipmentIds.length === 0) return false;

  const { data: items, error: itemError } = await supabase
    .from('fighter_equipment')
    .select('id, granted_by_equipment_id')
    .in('id', fighterEquipmentIds);
  if (itemError) throw itemError;
  if (!items?.length) return false;

  const ids = new Set<string>(fighterEquipmentIds);
  for (const item of items) {
    if (item.granted_by_equipment_id) ids.add(item.granted_by_equipment_id);
  }

  const { data: children, error: childError } = await supabase
    .from('fighter_equipment')
    .select('id')
    .in('granted_by_equipment_id', fighterEquipmentIds);
  if (childError) throw childError;
  for (const child of children ?? []) ids.add(child.id);

  const { data: locked, error: lockError } = await supabase
    .from('campaign_trade_items')
    .select('id')
    .in('fighter_equipment_id', [...ids])
    .eq('locked', true)
    .limit(1)
    .maybeSingle();
  if (lockError) throw lockError;
  return !!locked;
}
