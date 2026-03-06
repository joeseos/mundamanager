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

    // Accessible custom skill types (user-owned + campaign-shared)
    let customSkillTypes: { id: string; name: string }[] = [];
    if (fighterId) {
      // 1. User's own custom skill types
      const { data: ownTypes } = await supabase
        .from('custom_skill_types')
        .select('id, name')
        .eq('user_id', userId);

      // 2. Custom skill types from skills shared to the fighter's campaign
      const { data: fighter } = await supabase
        .from('fighters')
        .select('gang_id')
        .eq('id', fighterId)
        .single();

      let sharedTypes: { id: string; name: string }[] = [];
      if (fighter?.gang_id) {
        const { data: campaignGangs } = await supabase
          .from('campaign_gangs')
          .select('campaign_id')
          .eq('gang_id', fighter.gang_id);

        const campaignIds = (campaignGangs ?? []).map(cg => cg.campaign_id);

        if (campaignIds.length > 0) {
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
              sharedTypes = types ?? [];
            }
          }
        }
      }

      // Merge and deduplicate
      const byId = new Map<string, { id: string; name: string }>();
      for (const t of [...(ownTypes ?? []), ...sharedTypes]) {
        byId.set(t.id, t);
      }
      customSkillTypes = Array.from(byId.values());
    }

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