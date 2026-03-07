import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getUserIdFromClaims } from "@/utils/auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fighterId = searchParams.get('fighterId');

    const supabase = await createClient();

    // Check if user is authenticated
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Standard skill types
    const { data, error } = await supabase
      .from('skill_types')
      .select('*');

    if (error) throw error;

    // Always fetch user's own custom skill types
    const { data: ownTypes } = await supabase
      .from('custom_skill_types')
      .select('id, name')
      .eq('user_id', userId);

    const byId = new Map<string, { id: string; name: string }>();
    for (const t of (ownTypes ?? [])) {
      byId.set(t.id, t);
    }

    // If fighterId provided, also fetch campaign-shared custom skill types
    if (fighterId) {
      const { data: fighter } = await supabase
        .from('fighters')
        .select('gang_id')
        .eq('id', fighterId)
        .single();

      if (fighter?.gang_id) {
        const { data: campaignGangs } = await supabase
          .from('campaign_gangs')
          .select('campaign_id')
          .eq('gang_id', fighter.gang_id);

        const campaignIds = (campaignGangs ?? []).map(cg => cg.campaign_id);

        if (campaignIds.length > 0) {
          // Custom skill types from shared skills
          const { data: sharedSkills } = await supabase
            .from('custom_shared')
            .select('custom_skill_id')
            .in('campaign_id', campaignIds)
            .not('custom_skill_id', 'is', null);

          const sharedSkillIds = (sharedSkills ?? []).map(s => s.custom_skill_id);

          if (sharedSkillIds.length > 0) {
            const { data: skillsWithTypes } = await supabase
              .from('custom_skills')
              .select('custom_skill_type_id')
              .in('id', sharedSkillIds)
              .not('custom_skill_type_id', 'is', null);

            const sharedTypeIds = Array.from(new Set(
              (skillsWithTypes ?? []).map(s => s.custom_skill_type_id).filter(Boolean)
            ));

            if (sharedTypeIds.length > 0) {
              const { data: types } = await supabase
                .from('custom_skill_types')
                .select('id, name')
                .in('id', sharedTypeIds);
              for (const t of (types ?? [])) {
                byId.set(t.id, t);
              }
            }
          }

          // Custom skill types referenced by shared custom fighter types' skill access
          const { data: sharedFighters } = await supabase
            .from('custom_shared')
            .select('custom_fighter_type_id')
            .in('campaign_id', campaignIds)
            .not('custom_fighter_type_id', 'is', null);

          const sharedFighterTypeIds = (sharedFighters ?? []).map(s => s.custom_fighter_type_id).filter(Boolean);

          if (sharedFighterTypeIds.length > 0) {
            const { data: fighterSkillAccess } = await supabase
              .from('fighter_type_skill_access')
              .select('custom_skill_type_id')
              .in('custom_fighter_type_id', sharedFighterTypeIds)
              .not('custom_skill_type_id', 'is', null);

            const fighterCustomTypeIds = Array.from(new Set(
              (fighterSkillAccess ?? []).map(a => a.custom_skill_type_id).filter(Boolean)
            ));

            if (fighterCustomTypeIds.length > 0) {
              const { data: types } = await supabase
                .from('custom_skill_types')
                .select('id, name')
                .in('id', fighterCustomTypeIds);
              for (const t of (types ?? [])) {
                byId.set(t.id, t);
              }
            }
          }
        }
      }
    }

    const customSkillTypes = Array.from(byId.values());

    return NextResponse.json([
      ...(data ?? []).map((t: any) => ({ ...t, is_custom: false })),
      ...customSkillTypes.map(t => ({ ...t, is_custom: true })),
    ]);
  } catch (error) {
    console.error('Error in GET /api/skill-types:', error);
    return NextResponse.json(
      { error: 'Failed to fetch skill sets' },
      { status: 500 }
    );
  }
} 