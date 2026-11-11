import { TraitModificationData } from '@/types/fighter-effect';

/** A gang_rules row with its fighter effect type, as getGangRules reads it. */
export interface GangRuleRow {
  gang_type_id: string;
  gang_origin_id: string | null;
  gang_subtype_id: string | null;
  excluded: boolean;
  fighter_effect_type: {
    id: string;
    effect_name: string | null;
    type_specific_data: unknown;
    fighter_effect_type_modifiers: Array<{
      stat_name: string | null;
      default_numeric_value: number | null;
      operation: string | null;
    }>;
  };
}

/** A gang rule in the shape applyWeaponModifiers takes. */
export interface GangRuleEffect {
  id: string;
  effect_name: string;
  type_specific_data?: TraitModificationData;
  fighter_effect_modifiers: Array<{ stat_name: string; numeric_value: number; operation?: 'add' | 'set' }>;
}

type CategoryOf = { equipment_category_id?: string | null } | null | undefined;

/** The gang rules for one owned weapon: a rule with equipment_category_ids applies only to weapons in those categories. */
export function gangRulesForWeapon(
  rules: GangRuleEffect[],
  item: { equipment?: CategoryOf; custom_equipment?: CategoryOf }
): GangRuleEffect[] {
  const categoryId = item.equipment?.equipment_category_id ?? item.custom_equipment?.equipment_category_id;
  return rules.filter(rule => {
    const categoryIds = rule.type_specific_data?.equipment_category_ids;
    return !categoryIds?.length || (!!categoryId && categoryIds.includes(categoryId));
  });
}

interface GangScopeFields {
  gang_type_id: string | null;
  gang_origin_id?: string | null;
  gang_subtypes?: string[] | null;
}

/**
 * The rules that apply to a gang: those with a matching grant row and no matching deny
 * row. A row matches the gangs of its gang type, narrowed by its origin and subtype when set.
 */
export function resolveGangRules(rows: GangRuleRow[], gang: GangScopeFields): GangRuleEffect[] {
  const subtypes = gang.gang_subtypes ?? [];
  const matches = (row: GangRuleRow) =>
    row.gang_type_id === gang.gang_type_id
    && (!row.gang_origin_id || row.gang_origin_id === gang.gang_origin_id)
    && (!row.gang_subtype_id || subtypes.includes(row.gang_subtype_id));

  const matching = rows.filter(matches);
  const denied = new Set(matching.filter(row => row.excluded).map(row => row.fighter_effect_type.id));
  const granted = new Map(
    matching
      .filter(row => !row.excluded && !denied.has(row.fighter_effect_type.id))
      .map(row => [row.fighter_effect_type.id, row.fighter_effect_type])
  );

  return [...granted.values()].map(type => ({
    id: type.id,
    effect_name: type.effect_name ?? '',
    type_specific_data: (type.type_specific_data ?? undefined) as TraitModificationData | undefined,
    fighter_effect_modifiers: type.fighter_effect_type_modifiers.flatMap(m =>
      m.stat_name
        ? [{ stat_name: m.stat_name, numeric_value: m.default_numeric_value ?? 0, operation: (m.operation ?? 'add') as 'add' | 'set' }]
        : []
    ),
  }));
}
