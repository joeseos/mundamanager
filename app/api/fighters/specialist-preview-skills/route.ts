import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { PermissionService } from '@/app/lib/user-permissions';
import { getUserIdFromClaims } from '@/utils/auth';

/**
 * Skills in a Primary skill set for a fighter as if they were already promoted to
 * `previewFighterTypeId` (used before Buy Advancement applies the promotion on the server).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fighterId = searchParams.get('fighterId');
    const skillTypeId = searchParams.get('skillTypeId');
    const previewFighterTypeId = searchParams.get('previewFighterTypeId');
    const previewCustomFighterTypeId = searchParams.get('previewCustomFighterTypeId');

    if (!fighterId || !skillTypeId || (!previewFighterTypeId && !previewCustomFighterTypeId)) {
      return NextResponse.json(
        { error: 'Missing fighterId, skillTypeId, or preview fighter type' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: fighter, error: fighterError } = await supabase
      .from('fighters')
      .select('gang_id')
      .eq('id', fighterId)
      .single();

    if (fighterError || !fighter) {
      return NextResponse.json({ error: 'Fighter not found' }, { status: 404 });
    }

    const permissionService = new PermissionService();
    const permissions = await permissionService.getGangPermissions(userId, fighter.gang_id);

    if (!permissions.canEdit) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const { data: gangData } = await supabase
      .from('gangs')
      .select('gang_origin_id')
      .eq('id', fighter.gang_id)
      .single();

    const gangOriginId = gangData?.gang_origin_id ?? null;

    const { data: overrides } = await supabase
      .from('fighter_skill_access_override')
      .select('skill_type_id, access_level')
      .eq('fighter_id', fighterId);

    const overrideMap = new Map(
      (overrides || []).map((o) => [o.skill_type_id, o.access_level])
    );

    let accessQuery = supabase
      .from('fighter_type_skill_access')
      .select('skill_type_id, custom_skill_type_id, access_level');

    if (previewFighterTypeId) {
      accessQuery = accessQuery.eq('fighter_type_id', previewFighterTypeId);
    } else {
      accessQuery = accessQuery.eq('custom_fighter_type_id', previewCustomFighterTypeId!);
    }

    const { data: accessRows, error: accessErr } = await accessQuery;

    if (accessErr) {
      return NextResponse.json({ error: accessErr.message }, { status: 500 });
    }

    const row = (accessRows || []).find(
      (a) => a.skill_type_id === skillTypeId || a.custom_skill_type_id === skillTypeId
    );

    if (!row) {
      return NextResponse.json(
        { error: 'Skill type is not available for this promoted fighter type' },
        { status: 400 }
      );
    }

    const effectiveId = row.skill_type_id || row.custom_skill_type_id;
    const effectiveAccess =
      (effectiveId ? overrideMap.get(effectiveId) : undefined) ?? row.access_level ?? null;

    if (effectiveAccess !== 'primary') {
      return NextResponse.json(
        { error: 'Skill type is not a Primary set for this promoted fighter type' },
        { status: 400 }
      );
    }

    if (row.custom_skill_type_id === skillTypeId) {
      return NextResponse.json(
        {
          error:
            'Preview skills for custom skill types are not supported here; promote and refresh if needed.'
        },
        { status: 400 }
      );
    }

    const { data: skillsRaw, error: skillsErr } = await supabase
      .from('skills')
      .select('id, name, skill_type_id, gang_origin_id')
      .eq('skill_type_id', skillTypeId);

    if (skillsErr) {
      return NextResponse.json({ error: skillsErr.message }, { status: 500 });
    }

    const skillsFiltered = (skillsRaw || []).filter((s) => {
      if (s.gang_origin_id == null) return true;
      return gangOriginId != null && s.gang_origin_id === gangOriginId;
    });

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
      available: !ownedIds.has(s.id)
    }));

    return NextResponse.json({ skills });
  } catch (error) {
    console.error('Error in GET /api/fighters/specialist-preview-skills:', error);
    return NextResponse.json(
      { error: 'Failed to fetch preview skills' },
      { status: 500 }
    );
  }
}
