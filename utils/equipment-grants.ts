import type { EquipmentGrantOption, EquipmentGrants } from '@/types/equipment';

/**
 * The options a grant gives: all of them for a fixed grant, otherwise the chosen ones,
 * checked against the grant's selection type.
 */
export function chosenGrantOptions(
  grants: EquipmentGrants,
  selectedEquipmentIds: string[] = []
): EquipmentGrantOption[] {
  if (grants.selection_type === 'fixed') return grants.options;

  const chosen = grants.options.filter(opt => selectedEquipmentIds.includes(opt.equipment_id));

  if (grants.selection_type === 'single_select' && chosen.length !== 1) {
    throw new Error('Single select requires exactly one option to be selected');
  }
  if (grants.selection_type === 'multiple_select') {
    const maxSelections = grants.max_selections || grants.options.length;
    if (chosen.length === 0) {
      throw new Error('At least one option must be selected');
    }
    if (chosen.length > maxSelections) {
      throw new Error(`Cannot select more than ${maxSelections} options`);
    }
  }
  return chosen;
}

/**
 * Insert granted equipment linked to the fighter_equipment row that granted it, so it is
 * deleted with it. purchase_cost is the option's additional cost. Returns the rows with their
 * weapon profiles, for the fighter card.
 */
export async function insertGrantedEquipment(
  supabase: any,
  options: EquipmentGrantOption[],
  row: {
    granted_by_equipment_id: string;
    gang_id: string;
    fighter_id?: string | null;
    vehicle_id?: string | null;
    user_id: string;
  }
) {
  if (options.length === 0) return [];

  const { data: equipment } = await supabase
    .from('equipment')
    .select('id, cost')
    .in('id', options.map(opt => opt.equipment_id));

  const inserts = options.flatMap(opt => {
    const item = equipment?.find((e: { id: string }) => e.id === opt.equipment_id);
    return item
      ? [{
          ...row,
          equipment_id: item.id,
          original_cost: item.cost,
          purchase_cost: opt.additional_cost,
        }]
      : [];
  });
  if (inserts.length === 0) return [];

  const { data: inserted, error } = await supabase
    .from('fighter_equipment')
    .insert(inserts)
    .select('id, equipment_id, purchase_cost, equipment!equipment_id(equipment_name, equipment_type, weapon_profiles(*))');

  if (error) console.error('Failed to add granted equipment:', error);
  return (inserted ?? []) as Array<{
    id: string;
    equipment_id: string;
    purchase_cost: number;
    equipment: { equipment_name: string; equipment_type: string; weapon_profiles: any[] } | null;
  }>;
}

/**
 * The equipment an item granted (e.g. an Outrider Quad's weapon) that is still with it: on the same
 * fighter or vehicle, or in the stash when the item is. Deleting the item cascades to it, and moving
 * the item takes it along.
 */
export async function grantedEquipment(
  supabase: any,
  item: { id: string; fighter_id?: string | null; vehicle_id?: string | null }
): Promise<{ ids: string[]; cost: number }> {
  const query = supabase
    .from('fighter_equipment')
    .select('id, purchase_cost')
    .eq('granted_by_equipment_id', item.id);
  const { data } = await (item.fighter_id ? query.eq('fighter_id', item.fighter_id)
    : item.vehicle_id ? query.eq('vehicle_id', item.vehicle_id)
    : query.eq('gang_stash', true));
  const rows: Array<{ id: string; purchase_cost: number | null }> = data ?? [];
  return {
    ids: rows.map(row => row.id),
    cost: rows.reduce((sum, row) => sum + (row.purchase_cost || 0), 0),
  };
}
