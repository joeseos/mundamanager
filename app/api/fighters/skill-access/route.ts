import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { PermissionService } from '@/app/lib/user-permissions';
import { getUserIdFromClaims } from '@/utils/auth';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fighterId = searchParams.get('fighterId');
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
        access_level,
        skill_types (
          id,
          name
        )
      `);

    // Query based on fighter type (regular or custom)
    if (fighter.custom_fighter_type_id) {
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
    const formattedSkillAccess = skillAccess.map(access => {
      const overrideLevel = overrideMap.get(access.skill_type_id) || null;
      return {
        skill_type_id: access.skill_type_id,
        access_level: access.access_level, // default from fighter type
        override_access_level: overrideLevel, // override from archetype (or null)
        skill_type_name: (access.skill_types as any)?.name || 'Unknown'
      };
    });

    // Add overrides that don't have defaults (e.g., from archetypes)
    const defaultSkillTypeIds = new Set(skillAccess.map(a => a.skill_type_id));

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