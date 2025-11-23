import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { PermissionService } from '@/app/lib/user-permissions';
import { getAuthenticatedUser, getUserIdFromClaims } from '@/utils/auth';

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
    const currentUser = await getAuthenticatedUser(supabase);

    // Use PermissionService to check fighter permissions
    const permissionService = new PermissionService();
    const permissions = await permissionService.getFighterPermissions(currentUser.id, fighterId);

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

    // Format the response
    const formattedSkillAccess = skillAccess.map(access => ({
      skill_type_id: access.skill_type_id,
      access_level: access.access_level,
      skill_type_name: (access.skill_types as any)?.name || 'Unknown'
    }));

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