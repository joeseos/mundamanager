import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getNotifications } from "@/app/lib/notifications";
import { getUserIdFromClaims } from "@/utils/auth";

/**
 * GET /api/notifications
 * The signed-in user's newest notifications, for the header and the account page.
 */
export async function GET() {
  const supabase = await createClient();

  try {
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(await getNotifications(userId));
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/notifications with { ids }
 * Marks notifications as read. The policies only let users update their own.
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();

  try {
    if (!await getUserIdFromClaims(supabase)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ids } = await request.json();
    const { error } = await supabase.from('notifications').update({ dismissed: true }).in('id', ids);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking notifications read:', error);
    return NextResponse.json(
      { error: 'Failed to mark notifications read' },
      { status: 500 }
    );
  }
}
