import { NextResponse } from 'next/server'
import { createClient } from "@/utils/supabase/server";
import { getUserIdFromClaims } from "@/utils/auth";
import { getEditions } from "@/app/lib/editions";

/**
 * The editions list for the admin authoring screens.
 *
 * App pages do NOT call this: rows carry their own `edition_slug`, resolved by
 * the server fetch that loads them (see app/lib/*), so ordinary pages never
 * need the editions table in the browser. Only components that genuinely need
 * to *choose* an edition — the admin EditionSelect dropdown — fetch it here.
 *
 * The body comes from the cached lib, so repeat calls cost no Supabase query.
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
