import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { getUserIdFromClaims } from '@/utils/auth';
import { getAppDb } from '@/utils/db/client';
import { WEAPON_PROFILE_COLUMNS } from '@/app/lib/shared/gang-data';
import { isUuid } from '@/utils/uuid';

/** A custom weapon's own profiles plus the ones grouped under it (ammunition). */
export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Invalid equipment id' }, { status: 400 });
  }

  // The direct connection doesn't check who is asking, so only signed-in users may call this route
  if (!await getUserIdFromClaims(await createClient())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const profiles = await getAppDb().query.customWeaponProfiles.findMany({
    columns: { ...WEAPON_PROFILE_COLUMNS, custom_equipment_id: true },
    where: (row, { eq, or }) => or(eq(row.custom_equipment_id, id), eq(row.weapon_group_id, id)),
    orderBy: (row, { asc }) => [asc(row.sort_order), asc(row.id)],
  });
  return NextResponse.json(profiles);
}
