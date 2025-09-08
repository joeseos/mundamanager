import { createClient } from "@/utils/supabase/server";
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createClient();
  try {
    const { data: effects, error: effectsError } = await supabase
      .from('fighter_effect_types')
      .select(`
        *,
        fighter_effect_type_modifiers (
          *
        )
      `)
      .eq('fighter_effect_category_id', 'a993261a-4172-4afb-85bf-f35e78a1189f')
      .order('effect_name');

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