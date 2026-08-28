import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { getUserIdFromClaims } from "@/utils/auth";
import { getEditions } from "@/utils/editions";

/**
 * The editions list, for admin screens that need to *choose* an edition.
 * App pages don't call this — their rows arrive with `edition_slug` already
 * resolved by the server fetch that loaded them (see app/lib/*).
 */
export async function GET() {
  const supabase = await createClient();

  try {
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(await getEditions())
  } catch (error) {
    console.error('Error fetching editions:', error)
    return NextResponse.json({ error: 'Error fetching editions' }, { status: 500 })
  }
}
