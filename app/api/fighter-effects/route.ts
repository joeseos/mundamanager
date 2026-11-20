import { NextRequest, NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { createClient } from '@/utils/supabase/server';
import { getUserIdFromClaims } from "@/utils/auth";
import { getAppDb } from '@/utils/db/client';
import { fighterEffectCategories } from '@/utils/db/schema';
import type { FighterEffectType } from '@/types/fighter-effect';

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

/**
 * GET /api/fighter-effects?category=… | ?equipmentId=… | ?powerBoostTypeId=…
 * Effect types with their modifiers: every type in a category (by category_name,
 * e.g. 'power-boosts'), or the types an item or power boost brings. Every
 * signed-in user reads the same admin-owned rows.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  try {
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const equipmentId = searchParams.get('equipmentId');
    const powerBoostTypeId = searchParams.get('powerBoostTypeId');
    const db = getAppDb();

    if (category) {
      const types = await db.query.fighterEffectTypes.findMany({
        columns: { ...EFFECT_TYPE_COLUMNS, edition_id: true },
        where: (type, { inArray }) => inArray(
          type.fighter_effect_category_id,
          db.select({ id: fighterEffectCategories.id })
            .from(fighterEffectCategories)
            .where(eq(fighterEffectCategories.category_name, category))
        ),
        orderBy: (type, { asc }) => asc(type.effect_name),
        with: { fighter_effect_type_modifiers: { columns: MODIFIER_COLUMNS } },
      });
      return NextResponse.json(types.map(({ fighter_effect_type_modifiers, ...type }) => ({
        ...type,
        modifiers: fighter_effect_type_modifiers,
      })) as FighterEffectType[]);
    }

    if (!equipmentId && !powerBoostTypeId) {
      return NextResponse.json({ error: 'Equipment ID, Power Boost Type ID or category is required' }, { status: 400 });
    }

    // Matched on the id type_specific_data names. The key is a literal in the SQL so
    // idx_fet_equipment_id_jsonb, built on ->> 'equipment_id', can be used.
    const key = equipmentId ? 'equipment_id' : 'power_boost_type_id';
    const types = await db.query.fighterEffectTypes.findMany({
      columns: EFFECT_TYPE_COLUMNS,
      where: (type) => sql`${type.type_specific_data} ->> ${sql.raw(`'${key}'`)} = ${equipmentId ?? powerBoostTypeId}`,
      with: {
        fighter_effect_category: { columns: { id: true, category_name: true } },
        fighter_effect_type_modifiers: { columns: MODIFIER_COLUMNS },
      },
    });
    return NextResponse.json(types.map(({ fighter_effect_category, fighter_effect_type_modifiers, ...type }) => ({
      ...type,
      fighter_effect_categories: fighter_effect_category ?? undefined,
      modifiers: fighter_effect_type_modifiers,
    })) as FighterEffectType[]);
  } catch (error) {
    console.error('Error in GET /fighter-effects:', error);
    return NextResponse.json({ error: 'Failed to fetch fighter effect types' }, { status: 500 });
  }
}
