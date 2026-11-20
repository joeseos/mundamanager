import { eq, sql } from 'drizzle-orm';
import { getAppDb } from '@/utils/db/client';
import { fighterEffectCategories } from '@/utils/db/schema';
import type { FighterEffectType } from '@/types/fighter-effect';

/**
 * Effect type templates for the pickers in the purchase, stash, upgrade and
 * power boost modals. Every signed-in user reads the same admin-owned rows.
 */

const EFFECT_TYPE_COLUMNS = {
  id: true,
  effect_name: true,
  fighter_effect_category_id: true,
  type_specific_data: true,
  sort_order: true,
} as const;

const MODIFIER_COLUMNS = {
  id: true,
  fighter_effect_type_id: true,
  stat_name: true,
  default_numeric_value: true,
  operation: true,
} as const;

/** Every effect type in a category (by category_name, e.g. 'power-boosts'), by name. */
export async function getFighterEffectTypesInCategory(categoryName: string): Promise<FighterEffectType[]> {
  const db = getAppDb();
  const types = await db.query.fighterEffectTypes.findMany({
    columns: { ...EFFECT_TYPE_COLUMNS, edition_id: true },
    where: (type, { inArray }) => inArray(
      type.fighter_effect_category_id,
      db.select({ id: fighterEffectCategories.id })
        .from(fighterEffectCategories)
        .where(eq(fighterEffectCategories.category_name, categoryName))
    ),
    orderBy: (type, { asc }) => asc(type.effect_name),
    with: { fighter_effect_type_modifiers: { columns: MODIFIER_COLUMNS } },
  });
  return types.map(({ fighter_effect_type_modifiers, ...type }) => ({
    ...type,
    modifiers: fighter_effect_type_modifiers,
  })) as FighterEffectType[];
}

/**
 * The effect types an item or power boost brings, matched on the id its
 * type_specific_data names. The key is written into the SQL as a literal so
 * idx_fet_equipment_id_jsonb, built on ->> 'equipment_id', can be used.
 */
export async function getFighterEffectTypesFor(
  key: 'equipment_id' | 'power_boost_type_id',
  id: string
): Promise<FighterEffectType[]> {
  const types = await getAppDb().query.fighterEffectTypes.findMany({
    columns: EFFECT_TYPE_COLUMNS,
    where: (type) => sql`${type.type_specific_data} ->> ${sql.raw(`'${key}'`)} = ${id}`,
    with: {
      fighter_effect_category: { columns: { id: true, category_name: true } },
      fighter_effect_type_modifiers: { columns: MODIFIER_COLUMNS },
    },
  });
  return types.map(({ fighter_effect_category, fighter_effect_type_modifiers, ...type }) => ({
    ...type,
    fighter_effect_categories: fighter_effect_category ?? undefined,
    modifiers: fighter_effect_type_modifiers,
  })) as FighterEffectType[];
}
