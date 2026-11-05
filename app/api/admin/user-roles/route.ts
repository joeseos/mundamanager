import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/utils/supabase/server';
import { checkAdmin, getAuthenticatedUser } from '@/utils/auth';
import { invalidateUser, invalidateUserPermissions } from '@/utils/cache-tags';
import { USER_ROLES, type UserRole } from '@/types/user-permissions';

/** Everyone on the Admin and Moderator teams. */
export async function GET() {
  const supabase = await createClient();

  try {
    const isAdmin = await checkAdmin(supabase);
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, user_role')
      .in('user_role', ['admin', 'moderator'])
      .order('username');

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching user roles:', error);
    return NextResponse.json({ error: 'Failed to fetch user roles' }, { status: 500 });
  }
}

/** Change one user's role. Body: { userId: string, role: 'user' | 'moderator' | 'admin' } */
export async function PATCH(request: Request) {
  const supabase = await createClient();

  try {
    const user = await getAuthenticatedUser(supabase).catch(() => null);
    if (!user || !(await checkAdmin(supabase, user))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, role } = await request.json();

    if (typeof userId !== 'string' || !USER_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `userId and a role (${USER_ROLES.join(', ')}) are required` },
        { status: 400 }
      );
    }
    // Another admin has to do it, so nobody demotes themselves by mistake
    if (userId === user.id) {
      return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 });
    }

    // Signed-in users have no UPDATE grant on user_role, so the service role writes it
    const { data, error } = await createServiceRoleClient()
      .from('profiles')
      .update({ user_role: role as UserRole })
      .eq('id', userId)
      .select('id');

    if (error) throw error;
    if (!data.length) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    invalidateUser(userId);
    invalidateUserPermissions(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating user role:', error);
    return NextResponse.json({ error: 'Failed to update user role' }, { status: 500 });
  }
}
