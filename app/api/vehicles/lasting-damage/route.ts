import { createClient } from "@/utils/supabase/server";
import { NextResponse } from 'next/server';
import { getEditionIdBySlug } from '@/app/lib/editions';

/**
 * Lists the vehicle lasting damage catalog. effect_name is reused across editions
 * (both have a 'Superficial Damage'), so callers should scope with `edition_slug`
 * or `edition_id` — omitting both returns every edition's rows.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  try {
    const url = new URL(request.url);
    const editionSlug = url.searchParams.get('edition_slug');
    const editionId = url.searchParams.get('edition_id');

    let resolvedEditionId = editionId;

    if (!resolvedEditionId && editionSlug) {
      resolvedEditionId = await getEditionIdBySlug(editionSlug);

      if (!resolvedEditionId) {
        return NextResponse.json({
          error: 'Unknown edition',
          details: `No edition with slug '${editionSlug}'`
        }, { status: 400 });
      }
    }

    let query = supabase
      .from('fighter_effect_types')
      .select(`
        *,
        fighter_effect_type_modifiers (
          *
        )
      `)
      .eq('fighter_effect_category_id', 'a993261a-4172-4afb-85bf-f35e78a1189f')
      .order('effect_name');

    if (resolvedEditionId) {
      query = query.eq('edition_id', resolvedEditionId);
    }

    // An empty list is valid: an edition may have no vehicle damages defined yet
    const { data: effects, error: effectsError } = await query;

    if (effectsError) throw effectsError;

    // Transform the data to match what the fighter-details-card expects
    const transformedEffects = (effects || []).map((effect: any) => ({
      ...effect,
      // Transform fighter_effect_type_modifiers to fighter_effect_modifiers for consistency
      fighter_effect_modifiers: (effect.fighter_effect_type_modifiers || []).map((modifier: any) => ({
        id: modifier.id,
        stat_name: modifier.stat_name,
        numeric_value: modifier.default_numeric_value,
        fighter_effect_id: effect.id, // Link back to the effect
      })),
      // Remove the original field to avoid confusion
      fighter_effect_type_modifiers: undefined
    }));

    return NextResponse.json(transformedEffects);
  } catch (error) {
    console.error('Error fetching vehicle damages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch vehicle damages' },
      { status: 500 }
    );
  }
}

