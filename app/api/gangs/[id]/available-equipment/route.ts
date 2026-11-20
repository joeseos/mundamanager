import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getUserIdFromClaims } from '@/utils/auth';
import { withUserClaims } from '@/utils/db/client';

// get_equipment_detailed_data's arguments the equipment modal sends, besides gang_id, with their types
const ARG_TYPES = {
  gang_type_id: 'uuid',
  fighter_type_id: 'uuid',
  fighter_id: 'uuid',
  fighter_type_equipment: 'boolean',
  equipment_tradingpost: 'boolean',
  include_legacy: 'boolean',
  campaign_trading_post_type_ids: 'uuid[]',
  campaign_custom_trading_post_ids: 'uuid[]',
} as const;

/**
 * GET /api/gangs/[id]/available-equipment
 * Returns the equipment the gang can buy, from get_equipment_detailed_data.
 * Query params map to the function's arguments; id lists are comma-separated.
 * Arguments left out keep the function's defaults.
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id: gangId } = await props.params;
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const value = (name: string, type: (typeof ARG_TYPES)[keyof typeof ARG_TYPES]) => {
    if (!searchParams.has(name)) return undefined;
    const param = searchParams.get(name)!;
    if (type === 'boolean') return param === 'true';
    if (type === 'uuid[]') return param.split(',').filter(Boolean);
    return param;
  };

  try {
    const userId = await getUserIdFromClaims(supabase);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const namedArgs = [
      sql`gang_id => ${gangId}::uuid`,
      ...Object.entries(ARG_TYPES).flatMap(([name, type]) => {
        const arg = value(name, type);
        return arg === undefined ? [] : [sql`${sql.identifier(name)} => ${sql.param(arg)}::${sql.raw(type)}`];
      }),
    ];

    // The function shows the user's own custom equipment by auth.uid(), so it runs with
    // their claims. json_agg returns the rows as the Data API did, and the text is sent as is.
    const [row] = await withUserClaims(userId, (tx) =>
      tx.execute<{ json: string }>(sql`
        select coalesce(json_agg(equipment), '[]')::text as json
        from get_equipment_detailed_data(${sql.join(namedArgs, sql`, `)}) as equipment
      `)
    );

    return new NextResponse(row.json, { headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error fetching available equipment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch available equipment' },
      { status: 500 }
    );
  }
}
