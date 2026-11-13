import { createClient } from "@/utils/supabase/server";
import { NextResponse } from 'next/server';
import { getEditionIdBySlug } from '@/utils/editions';
import { grantedSkillsFromEffect } from '@/utils/effect-modifiers';

/**
 * Lists the lasting injury (or rig glitch) catalog.
 *
 * fighter_effect_types holds one row per injury per edition, and effect_name is
 * reused across editions — N23 and N26 both have a 'Captured' and an 'Eye
 * Injury', with different D66 positions and different modifiers. Callers must
 * scope the request to an edition via `edition_slug` or `edition_id`, otherwise
 * a fighter is offered another ruleset's injuries.
 *
 * Both filters are optional; omitting them returns every edition's rows.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  try {
    const url = new URL(request.url);
    const isSpyrer = url.searchParams.get('is_spyrer') === 'true';
    const categoryName = isSpyrer ? 'rig-glitches' : 'injuries';
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
        fighter_effect_categories!inner(*),
        fighter_effect_type_modifiers (
          *
        )
      `)
      .eq('fighter_effect_categories.category_name', categoryName);

    if (resolvedEditionId) {
      query = query.eq('edition_id', resolvedEditionId);
    }

    // An empty list is a valid answer, not an error: an edition may legitimately
    // have no injuries of this category defined yet (e.g. N26 rig glitches).
    const { data: effects, error: effectsError } = await query;

    if (effectsError) throw effectsError;

    // Names of the skills injuries grant, e.g. Bitter Enmity granting Berserker
    const grantedSkillIds = [...new Set((effects || []).flatMap(effect => grantedSkillsFromEffect(effect)))];
    const { data: grantedSkills } = grantedSkillIds.length > 0
      ? await supabase.from('skills').select('id, name').in('id', grantedSkillIds)
      : { data: [] };
    const skillById = new Map((grantedSkills || []).map(skill => [skill.id, skill]));

    const effectsWithSkills = (effects || []).map((effect) => {
      // Transform fighter_effect_type_modifiers to fighter_effect_modifiers format
      // This normalizes the API response to match the instance format used throughout the app
      const fighter_effect_modifiers = (effect.fighter_effect_type_modifiers || []).map((mod: any) => ({
        id: mod.id,
        stat_name: mod.stat_name,
        numeric_value: mod.default_numeric_value,
        operation: mod.operation
      }));

      const result: any = {
        ...effect,
        fighter_effect_modifiers,
        granted_skills: grantedSkillsFromEffect(effect).flatMap(id => skillById.get(id) ?? [])
      };
      // Remove the original type modifiers to avoid confusion
      delete result.fighter_effect_type_modifiers;

      return result;
    });

    return NextResponse.json(effectsWithSkills);
  } catch (error) {
    console.error('Error fetching injuries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch injuries' },
      { status: 500 }
    );
  }
}