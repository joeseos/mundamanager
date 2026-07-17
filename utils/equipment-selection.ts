import {
  EquipmentOption,
  DefaultEquipment,
  NormalizedEquipmentSelection,
  FighterType,
} from '@/types/fighter-type';

/**
 * Shape of a selected-equipment item as sent to the addFighterToGang server action.
 * Shared by the roster and gang-addition fighter-add flows.
 */
export interface SelectedEquipmentItem {
  equipment_id: string;
  cost: number;
  quantity: number;
  is_editable?: boolean;
}

/**
 * Normalize the RPC `equipment_selection` payload (nested array format) into the
 * UI-keyed map the fighter-add equipment picker renders from. Idempotent: if the
 * value is already in the keyed `select_type` format it is returned as-is.
 */
export function normalizeEquipmentSelection(equipmentSelection: any): NormalizedEquipmentSelection {
  // If already in old format (dynamic keys with select_type), return as is
  if (
    equipmentSelection &&
    Object.values(equipmentSelection).some(
      (cat: any) => cat && typeof cat === 'object' && 'select_type' in cat
    )
  ) {
    return equipmentSelection as NormalizedEquipmentSelection;
  }

  // If in new nested array format (current SQL output), convert to old format
  if (
    equipmentSelection &&
    typeof equipmentSelection === 'object' &&
    ['optional', 'optional_single', 'single', 'multiple'].some(k => k in equipmentSelection)
  ) {
    const result: NormalizedEquipmentSelection = {};
    let idCounter = 0;

    (['optional', 'optional_single', 'single', 'multiple'] as const).forEach(selectType => {
      const typeGroup = equipmentSelection[selectType];
      if (typeGroup && typeof typeGroup === 'object') {
        (['weapons', 'wargear'] as const).forEach(categoryName => {
          const categoryData = typeGroup[categoryName];
          if (Array.isArray(categoryData) && categoryData.length > 0) {

            // Check if this is nested arrays (groups) or flat array
            const isNestedArrays = categoryData.length > 0 && Array.isArray(categoryData[0]);

            const buildOptional = (source: any[], name: string) => {
              const defaults = source.filter((item: any) => item.is_default);
              const allReplacements: EquipmentOption[] = [];

              // Collect all replacements from all defaults (deduplicated by id)
              defaults.forEach((defaultItem: any) => {
                if (defaultItem.replacements && Array.isArray(defaultItem.replacements)) {
                  defaultItem.replacements.forEach((replacement: any) => {
                    const existing = allReplacements.find(r => r.id === replacement.id);
                    if (existing) {
                      existing.max_quantity = Math.max(existing.max_quantity, replacement.max_quantity || 1);
                    } else {
                      allReplacements.push({
                        id: replacement.id,
                        equipment_name: replacement.equipment_name,
                        equipment_type: replacement.equipment_type,
                        equipment_category: replacement.equipment_category,
                        cost: replacement.cost || 0,
                        max_quantity: replacement.max_quantity || 1,
                        is_editable: replacement.is_editable || false,
                      });
                    }
                  });
                }
              });

              const replacement_mode = defaults.find((item: any) => item.replacement_mode)?.replacement_mode as 'flexible' | 'strict' | undefined;

              return {
                name,
                select_type: selectType,
                default: defaults.map((item: any) => ({
                  id: item.id,
                  equipment_name: item.equipment_name,
                  equipment_type: item.equipment_type,
                  equipment_category: item.equipment_category,
                  quantity: item.quantity || 1,
                  is_editable: item.is_editable || false,
                })),
                options: allReplacements,
                ...(replacement_mode ? { replacement_mode } : {}),
              };
            };

            const buildChoice = (source: any[], name: string) => ({
              name,
              select_type: selectType,
              default: [] as DefaultEquipment[],
              options: source.map((item: any) => ({
                id: item.id,
                equipment_name: item.equipment_name,
                equipment_type: item.equipment_type,
                equipment_category: item.equipment_category,
                cost: item.cost || 0,
                max_quantity: item.max_quantity || 1,
                is_editable: item.is_editable || false,
              })),
            });

            const capitalized = categoryName.charAt(0).toUpperCase() + categoryName.slice(1);
            const isOptionalType = selectType === 'optional' || selectType === 'optional_single';

            if (isNestedArrays) {
              // Each inner array is a separate group
              categoryData.forEach((group: any[], groupIndex: number) => {
                if (Array.isArray(group) && group.length > 0) {
                  const key = `${categoryName}_${selectType}_${idCounter++}`;
                  const name = `${capitalized} ${groupIndex + 1}`;
                  result[key] = isOptionalType ? buildOptional(group, name) : buildChoice(group, name);
                }
              });
            } else {
              // Flat array (backward compatibility)
              const key = `${categoryName}_${selectType}_${idCounter++}`;
              result[key] = isOptionalType ? buildOptional(categoryData, capitalized) : buildChoice(categoryData, capitalized);
            }
          }
        });
      }
    });
    return result;
  }

  // Fallback: return empty
  return {};
}

/** Infer an equipment category from its name when the API doesn't provide one. */
export function inferCategoryFromEquipmentName(name: string): string {
  const lowerName = name.toLowerCase();

  if (lowerName.includes('claw') ||
      lowerName.includes('baton') ||
      lowerName.includes('sword') ||
      lowerName.includes('hammer') ||
      lowerName.includes('fist') ||
      lowerName.includes('knife') ||
      lowerName.includes('blade')) {
    return 'Close Combat Weapons';
  }

  if (lowerName.includes('gun') ||
      lowerName.includes('pistol') ||
      lowerName.includes('shotgun') ||
      lowerName.includes('rifle') ||
      lowerName.includes('lasgun') ||
      lowerName.includes('blaster')) {
    return 'Special Weapons';
  }

  if (lowerName.includes('armour') ||
      lowerName.includes('armor') ||
      lowerName.includes('carapace')) {
    return 'Armour';
  }

  return 'Other Equipment';
}

/** Extract the cost-0 default equipment from a fighter type's equipment_selection. */
export function getDefaultEquipmentFromSelection(equipmentSelection: any): SelectedEquipmentItem[] {
  const defaults: SelectedEquipmentItem[] = [];
  if (!equipmentSelection) return defaults;

  const normalizedSelection = normalizeEquipmentSelection(equipmentSelection);
  Object.values(normalizedSelection).forEach((categoryData) => {
    if (categoryData?.default && Array.isArray(categoryData.default)) {
      categoryData.default.forEach((item: DefaultEquipment) => {
        defaults.push({
          equipment_id: item.id,
          cost: 0, // Default equipment from equipment selections is always cost 0
          quantity: item.quantity || 1,
          is_editable: item.is_editable || false,
        });
      });
    }
  });

  return defaults;
}

/**
 * The base cost of a fighter type, honouring the delegation cost when the user has
 * opted into it (alliance delegations expose an alternate `delegation_cost`).
 */
export function getBaseCost(type: Pick<FighterType, 'total_cost' | 'delegation_cost'> | undefined, useDelegationCost: boolean): number {
  if (!type) return 0;
  if (useDelegationCost && type.delegation_cost != null) return type.delegation_cost;
  return type.total_cost || 0;
}
