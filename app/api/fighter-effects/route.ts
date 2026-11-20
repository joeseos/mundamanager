import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getUserIdFromClaims } from "@/utils/auth";
import { getFighterEffectTypesFor, getFighterEffectTypesInCategory } from '@/app/lib/fighter-effect-types';

/**
 * GET /api/fighter-effects?category=… | ?equipmentId=… | ?powerBoostTypeId=…
 * Effect types with their modifiers: every type in a category, or the types an
 * item or power boost brings.
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

    if (category) {
      return NextResponse.json(await getFighterEffectTypesInCategory(category));
    }
    if (equipmentId) {
      return NextResponse.json(await getFighterEffectTypesFor('equipment_id', equipmentId));
    }
    if (powerBoostTypeId) {
      return NextResponse.json(await getFighterEffectTypesFor('power_boost_type_id', powerBoostTypeId));
    }
    return NextResponse.json({ error: 'Equipment ID, Power Boost Type ID or category is required' }, { status: 400 });
  } catch (error) {
    console.error('Error in GET /fighter-effects:', error);
    return NextResponse.json({ error: 'Failed to fetch fighter effect types' }, { status: 500 });
  }
}
