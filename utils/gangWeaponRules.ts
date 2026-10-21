import { TraitModificationData } from '@/types/fighter-effect';

/** A gang_weapon_rules row with its fighter effect type, as getGangWeaponRules reads it. */
export interface GangWeaponRuleRow {
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

/** A gang weapon rule in the shape applyWeaponModifiers takes. */
export interface GangWeaponRuleEffect {
  id: string;
  effect_name: string;
  type_specific_data?: TraitModificationData;
  fighter_effect_modifiers: Array<{ stat_name: string; numeric_value: number; operation?: 'add' | 'set' }>;
}

interface GangScopeFields {
  gang_type_id: string | null;
  gang_origin_id?: string | null;
  gang_subtypes?: string[] | null;
}

/**
 * The weapon rules that apply to a gang: those with a matching grant row and no matching deny
 * row. A row matches the gangs of its gang type, narrowed by its origin and subtype when set.
 */
export function resolveGangWeaponRules(rows: GangWeaponRuleRow[], gang: GangScopeFields): GangWeaponRuleEffect[] {
  const subtypes = gang.gang_subtypes ?? [];
  const matches = (row: GangWeaponRuleRow) =>
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
