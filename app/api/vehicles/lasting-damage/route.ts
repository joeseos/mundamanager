import { createClient } from "@/utils/supabase/server";
import { NextResponse } from 'next/server';
import { getEditionIdBySlug } from '@/app/lib/editions';

/**
 * Lists the vehicle lasting damage catalog.
 *
 * fighter_effect_types holds one row per damage per edition, and effect_name is
 * reused across editions — N23 and N26 both have a 'Superficial Damage', on
 * different dice with different meanings. Callers must scope the request to an
 * edition via `edition_slug` or `edition_id`, otherwise a vehicle is offered
 * another ruleset's damages.
 *
 * Both filters are optional; omitting them returns every edition's rows.
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

    // An empty list is a valid answer, not an error: an edition may legitimately
    // have no vehicle damages defined yet.
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

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const url = new URL(request.url);
  const effectId = url.searchParams.get('effectId');

  if (!effectId) {
    return NextResponse.json(
      { error: 'Effect ID is required' },
      { status: 400 }
    );
  }

  try {
    const { error: deleteError } = await supabase
      .from('fighter_effects')
      .delete()
      .eq('id', effectId);

    if (deleteError) throw deleteError;

    return NextResponse.json({ message: 'Vehicle damage deleted successfully' });
  } catch (error) {
    console.error('Error deleting vehicle damage:', error);
    return NextResponse.json(
      { error: 'Failed to delete vehicle damage' },
      { status: 500 }
    );
  }
}