import { createClient } from "@/utils/supabase/server";
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  try {
    const url = new URL(request.url);
    const isSpyrer = url.searchParams.get('is_spyrer') === 'true';
    const categoryName = isSpyrer ? 'rig-glitches' : 'injuries';

    const { data: effects, error: effectsError } = await supabase
      .from('fighter_effect_types')
      .select(`
        *,
        fighter_effect_categories!inner(*),
        fighter_effect_type_modifiers (
          *
        )
      `)
      .eq('fighter_effect_categories.category_name', categoryName);

    if (effectsError) throw effectsError;

    // Transform and add skills for injuries
    const effectsWithSkills = await Promise.all(
      (effects || []).map(async (effect) => {
        // Transform fighter_effect_type_modifiers to fighter_effect_modifiers format
        // This normalizes the API response to match the instance format used throughout the app
        const fighter_effect_modifiers = (effect.fighter_effect_type_modifiers || []).map((mod: any) => ({
          id: mod.id,
          stat_name: mod.stat_name,
          numeric_value: mod.default_numeric_value,
          operation: mod.operation
        }));

        let result: any = {
          ...effect,
          fighter_effect_modifiers,
        };
        // Remove the original type modifiers to avoid confusion
        delete result.fighter_effect_type_modifiers;

        // For injuries that grant skills, fetch the skill names
        if (effect.type_specific_data?.skill_id) {
          const { data: skill } = await supabase
            .from('skills')
            .select('id, name')
            .eq('id', effect.type_specific_data.skill_id)
            .single();

          result.granted_skill = skill || null;
        }

        return result;
      })
    );

    return NextResponse.json(effectsWithSkills);
  } catch (error) {
    console.error('Error fetching injuries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch injuries' },
      { status: 500 }
    );
  }
}