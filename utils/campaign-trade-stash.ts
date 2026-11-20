import { isBeastWargear } from '@/types/equipment';

export interface TradeableStashItem {
  id: string;
  equipmentName: string;
}

export function isTradeableStashEquipment(item: {
  granted_by_equipment_id?: string | null;
  equipment_category?: string | null;
  type?: string;
  grants_fighter?: boolean;
}): boolean {
  if (item.granted_by_equipment_id) return false;
  if (item.type && item.type !== 'equipment') return false;
  // A fighter card stays with its gang, so an item that comes with one can't be traded
  if (item.grants_fighter) return false;
  return !isBeastWargear(item.equipment_category);
}
