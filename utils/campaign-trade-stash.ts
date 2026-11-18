const BEAST_EQUIPMENT_CATEGORIES = new Set([
  'status items: exotic beasts',
  'pets',
  'exotic beast',
]);

export function isTradeableStashEquipment(item: {
  granted_by_equipment_id?: string | null;
  equipment_category?: string | null;
  type?: string;
}): boolean {
  if (item.granted_by_equipment_id) return false;
  if (item.type && item.type !== 'equipment') return false;
  const category = (item.equipment_category ?? '').toLowerCase();
  return !BEAST_EQUIPMENT_CATEGORIES.has(category);
}
