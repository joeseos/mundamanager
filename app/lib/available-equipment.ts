import { sql } from 'drizzle-orm';
import { withUserClaims } from '@/utils/db/client';

/** The get_equipment_detailed_data arguments the equipment modal sends. */
export interface AvailableEquipmentArgs {
  gang_id: string;
  gang_type_id?: string;
  fighter_type_id?: string;
  fighter_id?: string;
  fighter_type_equipment?: boolean;
  equipment_tradingpost?: boolean;
  include_legacy?: boolean;
  campaign_trading_post_type_ids?: string[];
  campaign_custom_trading_post_ids?: string[];
}

const ARG_TYPES: Record<keyof AvailableEquipmentArgs, string> = {
  gang_id: 'uuid',
  gang_type_id: 'uuid',
  fighter_type_id: 'uuid',
  fighter_id: 'uuid',
  fighter_type_equipment: 'boolean',
  equipment_tradingpost: 'boolean',
  include_legacy: 'boolean',
  campaign_trading_post_type_ids: 'uuid[]',
  campaign_custom_trading_post_ids: 'uuid[]',
};

/**
 * The equipment a gang can buy, from get_equipment_detailed_data, as a JSON
 * array in the shape the Data API returns. The function shows the user's own
 * custom equipment by auth.uid(), so it runs with their claims. Arguments left
 * out keep the function's defaults.
 */
export async function getAvailableEquipmentJson(userId: string, args: AvailableEquipmentArgs): Promise<string> {
  const namedArgs = (Object.keys(ARG_TYPES) as (keyof AvailableEquipmentArgs)[])
    .filter((name) => args[name] !== undefined)
    .map((name) => sql`${sql.identifier(name)} => ${sql.param(args[name])}::${sql.raw(ARG_TYPES[name])}`);

  const [row] = await withUserClaims(userId, (tx) =>
    tx.execute<{ json: string }>(sql`
      select coalesce(json_agg(equipment), '[]')::text as json
      from get_equipment_detailed_data(${sql.join(namedArgs, sql`, `)}) as equipment
    `)
  );
  return row.json;
}
