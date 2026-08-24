import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/utils/auth";
import type { FighterOoaRecord } from "@/types/fighter-ooa-record";

/**
 * Returns a fighter's OOA / vehicle-wreck history.
 *
 * - `?direction=caused` (default): records where this fighter put someone
 *   Out of Action or wrecked their vehicle.
 * - `?direction=sustained`: records where this fighter was the one put Out
 *   of Action or whose vehicle was wrecked (the reverse).
 *
 * Uses snapshotted values so deleted fighters/gangs still render.
 */
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id: fighterId } = await props.params;
  const supabase = await createClient();

  try {
    await getAuthenticatedUser(supabase);

    if (!fighterId) {
      return NextResponse.json({ error: 'Fighter id is required' }, { status: 400 });
    }

    const url = new URL(request.url);
    const direction = url.searchParams.get('direction') === 'sustained' ? 'sustained' : 'caused';
    const column = direction === 'sustained' ? 'injured_fighter_id' : 'causing_fighter_id';

    const { data, error } = await supabase
      .from('fighter_ooa_records')
      .select('*')
      .eq(column, fighterId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json((data || []) as FighterOoaRecord[]);
  } catch (error) {
    console.error('Error fetching fighter OOA records:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fighter OOA records' },
      { status: 500 }
    );
  }
}
