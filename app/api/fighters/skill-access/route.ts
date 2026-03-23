import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { PermissionService } from '@/app/lib/user-permissions';
import { getUserIdFromClaims } from '@/utils/auth';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fighterId = searchParams.get('fighterId');
    /** When set, skill access rows are loaded for this promoted fighter type instead of the fighter's current type. */
    const previewFighterTypeId = searchParams.get('previewFighterTypeId');
    const previewCustomFighterTypeId = searchParams.get('previewCustomFighterTypeId');
    /** When set, also return the individual skills in this skill type (must be a Primary set). */
    const skillTypeId = searchParams.get('skillTypeId');
    if (!fighterId) {
      return NextResponse.json({ error: 'Missing fighterId' }, { status: 400 });
    }

    const supabase = await createClient();

    // Check if user is authenticated
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the fighter's fighter_type_id and custom_fighter_type_id
    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('fighter_type_id, custom_fighter_type_id, user_id, gang_id')
      .eq('id', fighterId)
      .single();

    if (fighterError || !fighter) {
      return NextResponse.json({ error: 'Fighter not found' }, { status: 404 });
    }

    // Check if user has access to this fighter (either owner or admin)
    // Use PermissionService to check gang permissions
    const permissionService = new PermissionService();
    const permissions = await permissionService.getGangPermissions(userId, fighter.gang_id);

    if (!permissions.canEdit) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // Simple query to check if table exists and has data
    const { data: tableCheck, error: tableCheckError } = await supabase
      .from('fighter_type_skill_access')
      .select('*')
      .limit(1);

    if (tableCheckError) {
      console.error('Table check error:', tableCheckError);
      return NextResponse.json(
        { error: `Table error: ${tableCheckError.message}` },
        { status: 500 }
      );
    }

    // Fetch skill access for the fighter's type (regular or custom)
    let query = supabase
      .from('fighter_type_skill_access')
      .select(`
        skill_type_id,
        custom_skill_type_id,
        access_level,
        skill_types (
          id,
          name
        ),
        custom_skill_types (
          id,
          name
        )
      `);

    // Query based on fighter type (regular or custom), or a preview type after promotion
    if (previewFighterTypeId) {
      query = query.eq('fighter_type_id', previewFighterTypeId);
    } else if (previewCustomFighterTypeId) {
      query = query.eq('custom_fighter_type_id', previewCustomFighterTypeId);
    } else if (fighter.custom_fighter_type_id) {
      // Custom fighter type
      query = query.eq('custom_fighter_type_id', fighter.custom_fighter_type_id);
    } else if (fighter.fighter_type_id) {
      // Regular fighter type
      query = query.eq('fighter_type_id', fighter.fighter_type_id);
    } else {
      // No fighter type found
      return NextResponse.json({ error: 'Fighter has no associated fighter type' }, { status: 400 });
    }

    const { data: skillAccess, error: skillAccessError } = await query;

    if (skillAccessError) {
      console.error('Error fetching skill access:', skillAccessError);
      return NextResponse.json(
        { error: `Skill access error: ${skillAccessError.message}` },
        { status: 500 }
      );
    }

    // Also fetch overrides for this fighter
    const { data: overrides, error: overridesError } = await supabase
      .from('fighter_skill_access_override')
      .select('skill_type_id, access_level')
      .eq('fighter_id', fighterId);

    if (overridesError) {
      console.error('Error fetching skill access overrides:', overridesError);
      return NextResponse.json(
        { error: `Overrides error: ${overridesError.message}` },
        { status: 500 }
      );
    }

    // Create override lookup map
    const overrideMap = new Map(
      (overrides || []).map(o => [o.skill_type_id, o.access_level])
    );

    // Format the response with defaults and overrides
    // access_level = default from fighter type, override_access_level = override from archetype
    // UI computes effective level as: override_access_level ?? access_level
    const formattedSkillAccess = (skillAccess || []).map((access) => {
      const effectiveId = access.skill_type_id || access.custom_skill_type_id;
      const overrideLevel = overrideMap.get(effectiveId) || null;
      return {
        skill_type_id: effectiveId,
        access_level: access.access_level, // default from fighter type
        override_access_level: overrideLevel, // override from archetype (or null)
        skill_type_name: (access.skill_types as any)?.name || (access.custom_skill_types as any)?.name || 'Unknown'
      };
    });

    // Add overrides that don't have defaults (e.g., from archetypes)
    const defaultSkillTypeIds = new Set((skillAccess || []).map((a) => a.skill_type_id || a.custom_skill_type_id));

    // Find overrides that don't have a corresponding default
    const overrideOnlySkillTypeIds = (overrides || [])
      .filter(o => !defaultSkillTypeIds.has(o.skill_type_id))
      .map(o => o.skill_type_id);

    if (overrideOnlySkillTypeIds.length > 0) {
      // Fetch skill type names for these overrides
      const { data: overrideSkillTypes } = await supabase
        .from('skill_types')
        .select('id, name')
        .in('id', overrideOnlySkillTypeIds);

      const overrideSkillTypeMap = new Map(
        (overrideSkillTypes || []).map(st => [st.id, st.name])
      );

      // Add these to formattedSkillAccess
      for (const override of overrides || []) {
        if (!defaultSkillTypeIds.has(override.skill_type_id)) {
          formattedSkillAccess.push({
            skill_type_id: override.skill_type_id,
            access_level: null, // no default from fighter type
            override_access_level: override.access_level, // override from archetype
            skill_type_name: overrideSkillTypeMap.get(override.skill_type_id) || 'Unknown'
          });
        }
      }
    }

    // When skillTypeId is provided, also return individual skills for that skill type
    if (skillTypeId) {
      // Verify the requested skill type has "primary" effective access
      const matchedAccess = formattedSkillAccess.find(
        (a) => a.skill_type_id === skillTypeId
      );
      const effectiveAccess = matchedAccess
        ? (matchedAccess.override_access_level ?? matchedAccess.access_level)
        : null;

      if (effectiveAccess !== 'primary') {
        return NextResponse.json(
          { error: 'Skill type is not a Primary set for this fighter type' },
          { status: 400 }
        );
      }

      // Fetch gang origin
      const { data: gangData } = await supabase
        .from('gangs')
        .select('gang_origin_id')
        .eq('id', fighter.gang_id)
        .single();
      const gangOriginId = gangData?.gang_origin_id ?? null;

      // Fetch skills in this skill type
      const { data: skillsRaw, error: skillsErr } = await supabase
        .from('skills')
        .select('id, name, skill_type_id, gang_origin_id')
        .eq('skill_type_id', skillTypeId);

      if (skillsErr) {
        return NextResponse.json({ error: skillsErr.message }, { status: 500 });
      }

      // Filter by gang origin
      const skillsFiltered = (skillsRaw || []).filter((s) => {
        if (s.gang_origin_id == null) return true;
        return gangOriginId != null && s.gang_origin_id === gangOriginId;
      });

      // Fetch owned skills
      const { data: ownedRows } = await supabase
        .from('fighter_skills')
        .select('skill_id')
        .eq('fighter_id', fighterId)
        .not('skill_id', 'is', null);

      const ownedIds = new Set((ownedRows || []).map((o) => o.skill_id).filter(Boolean));

      const skills = skillsFiltered.map((s) => ({
        skill_id: s.id,
        skill_name: s.name ?? 'Unknown',
        skill_type_id: s.skill_type_id as string,
        available: !ownedIds.has(s.id),
      }));

      return NextResponse.json({
        skill_access: formattedSkillAccess,
        skills,
      });
    }

    return NextResponse.json({
      skill_access: formattedSkillAccess
    });

  } catch (error) {
    console.error('Error in GET /api/fighters/skill-access:', error);
    return NextResponse.json(
      { error: 'Failed to fetch skill access' },
      { status: 500 }
    );
  }
} 