import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getUserIdFromClaims } from "@/utils/auth";
import { getEditionIdBySlug } from '@/utils/editions';
import { EDITION_N23, gangEditionSlug } from '@/types/edition';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fighterId = searchParams.get('fighterId');
    const editionSlugParam = searchParams.get('edition_slug');
    const editionIdParam = searchParams.get('edition_id');

    const supabase = await createClient();

    // Check if user is authenticated
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let resolvedEditionId = editionIdParam;
    let resolvedEditionSlug = editionSlugParam;
    let fighterGangId: string | null = null;

    if (fighterId) {
      const { data: fighter } = await supabase
        .from('fighters')
        .select('gang_id')
        .eq('id', fighterId)
        .maybeSingle();

      fighterGangId = fighter?.gang_id ?? null;

      // Prefer an explicit slug/id; otherwise derive edition from the fighter's gang.
      if (!resolvedEditionId && !resolvedEditionSlug && fighterGangId) {
        const { data: gang } = await supabase
          .from('gangs')
          .select(`
            gang_types!gang_type_id (
              editions:edition_id ( slug )
            ),
            custom_gang_type_edition:custom_gang_types!custom_gang_type_id (
              editions:edition_id ( slug )
            )
          `)
          .eq('id', fighterGangId)
          .maybeSingle();

        resolvedEditionSlug = gangEditionSlug(gang);
      }
    }

    if (!resolvedEditionId && resolvedEditionSlug) {
      resolvedEditionId = await getEditionIdBySlug(resolvedEditionSlug);
      if (!resolvedEditionId) {
        return NextResponse.json({
          error: 'Unknown edition',
          details: `No edition with slug '${resolvedEditionSlug}'`
        }, { status: 400 });
      }
    }

    // Standard skill types (optionally edition-scoped). Until an edition's
    // skill catalog is seeded, fall back to N23 so fighters don't get an empty
    // picker (N26 skill_types are not seeded yet).
    let catalogEditionId = resolvedEditionId;

    const fetchSkillTypes = async (editionId: string | null) => {
      let query = supabase.from('skill_types').select('*');
      if (editionId) query = query.eq('edition_id', editionId);
      return query;
    };

    let { data, error } = await fetchSkillTypes(catalogEditionId);
    if (error) throw error;

    if (catalogEditionId && (data?.length ?? 0) === 0) {
      const n23EditionId = await getEditionIdBySlug(EDITION_N23);
      if (n23EditionId && n23EditionId !== catalogEditionId) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[skill-types] No skill_types for edition "${resolvedEditionSlug ?? catalogEditionId}" — ` +
            `falling back to n23 until that edition's catalog is seeded.`
          );
        }
        catalogEditionId = n23EditionId;
        ({ data, error } = await fetchSkillTypes(catalogEditionId));
        if (error) throw error;
      }
    }

    // Always fetch user's own custom skill types
    let ownTypesQuery = supabase
      .from('custom_skill_types')
      .select('id, name, edition_id')
      .eq('user_id', userId);

    if (catalogEditionId) {
      ownTypesQuery = ownTypesQuery.eq('edition_id', catalogEditionId);
    }

    const { data: ownTypes } = await ownTypesQuery;

    const byId = new Map<string, { id: string; name: string; edition_id?: string | null }>();
    for (const t of (ownTypes ?? [])) {
      byId.set(t.id, t);
    }

    // If fighterId provided, also fetch campaign-shared custom skill types
    if (fighterGangId) {
      const { data: campaignGangs } = await supabase
        .from('campaign_gangs')
        .select('campaign_id')
        .eq('gang_id', fighterGangId);

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
            let typesQuery = supabase
              .from('custom_skill_types')
              .select('id, name, edition_id')
              .in('id', sharedTypeIds);

            if (catalogEditionId) {
              typesQuery = typesQuery.eq('edition_id', catalogEditionId);
            }

            const { data: types } = await typesQuery;
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
            let typesQuery = supabase
              .from('custom_skill_types')
              .select('id, name, edition_id')
              .in('id', fighterCustomTypeIds);

            if (catalogEditionId) {
              typesQuery = typesQuery.eq('edition_id', catalogEditionId);
            }

            const { data: types } = await typesQuery;
            for (const t of (types ?? [])) {
              byId.set(t.id, t);
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
