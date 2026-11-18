import { createClient } from '@/utils/supabase/server';

export const EQUIPMENT_LOCKED_IN_TRADE = 'This item is listed in a pending campaign trade.';

export async function equipmentLockedInTrade(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fighterEquipmentId: string
): Promise<boolean> {
  const { data: item, error: itemError } = await supabase
    .from('fighter_equipment')
    .select('id, granted_by_equipment_id')
    .eq('id', fighterEquipmentId)
    .maybeSingle();
  if (itemError) throw itemError;
  if (!item) return false;

  const ids = new Set<string>([fighterEquipmentId]);
  if (item.granted_by_equipment_id) ids.add(item.granted_by_equipment_id);

  const { data: children, error: childError } = await supabase
    .from('fighter_equipment')
    .select('id')
    .eq('granted_by_equipment_id', fighterEquipmentId);
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
