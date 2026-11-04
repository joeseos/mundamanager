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
