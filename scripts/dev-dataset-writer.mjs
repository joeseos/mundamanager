import { groupedBy } from './dev-dataset-utils.mjs';

export const SEED_BATCH_SIZE = 250;

// Fixture dependency order, not alphabetical order. Nullable cyclic references
// (notably fighters.active_loadout_id) are assigned after the parents are flushed.
const INSERT_ORDER = [
  'profiles', 'campaigns', 'campaign_allegiances', 'campaign_resources', 'campaign_maps',
  'gangs', 'campaign_members', 'campaign_gangs', 'campaign_gang_resources',
  'custom_fighter_types', 'custom_equipment', 'custom_weapon_profiles',
  'custom_skill_types', 'custom_skills', 'fighter_type_skill_access', 'fighter_defaults',
  'custom_fighter_type_equipment', 'custom_collections', 'custom_shared',
  'fighters', 'vehicles', 'fighter_skills', 'fighter_equipment', 'fighter_effects',
  'fighter_effect_modifiers', 'fighter_loadouts', 'fighter_loadout_equipment',
  'fighter_skill_access_override', 'campaign_map_objects', 'campaign_territories',
  'gang_logs', 'campaign_battles', 'fighter_ooa_records', 'battle_sessions',
  'battle_session_participants', 'battle_session_fighters', 'friends',
  'notification_sends', 'notifications',
];

export function insertBatches(rows) {
  // Group by supplied columns rather than filling absent fields with null:
  // omission must still invoke a database default, and custom/official FK arcs
  // must retain their distinct column sets.
  const shapes = new Map();
  for (const row of rows) {
    const columns = Object.keys(row).sort();
    const key = JSON.stringify(columns);
    if (!shapes.has(key)) shapes.set(key, { columns, rows: [] });
    shapes.get(key).rows.push(row);
  }
  const batches = [];
  for (const shape of shapes.values()) {
    const size = Math.min(SEED_BATCH_SIZE, Math.floor(60_000 / shape.columns.length));
    if (size < 1) throw new Error('Fixture row exceeds the SQL parameter budget.');
    for (let i = 0; i < shape.rows.length; i += size) {
      batches.push({ columns: shape.columns, rows: shape.rows.slice(i, i + size) });
    }
  }
  return batches;
}

export function createSeedWriter(sql, timestamp, counts) {
  const pending = new Map();
  let timestampColumns;
  return {
    // Queues only: callers must flush before reading/updating new database rows
    // or restoring side-effect triggers. IDs are generated before queueing.
    insert(table, row) {
      if (!INSERT_ORDER.includes(table)) throw new Error(`No fixture dependency order defined for ${table}.`);
      if (!pending.has(table)) pending.set(table, []);
      pending.get(table).push(row);
      counts[table] = (counts[table] ?? 0) + 1;
    },
    async flush() {
      if (!pending.size) return;
      timestampColumns ??= groupedBy(await sql`SELECT table_name,column_name FROM information_schema.columns
        WHERE table_schema='public' AND column_name IN ('created_at','updated_at')`, 'table_name');
      for (const table of INSERT_ORDER) {
        if (!pending.has(table)) continue;
        const timestamps = Object.fromEntries((timestampColumns.get(table) ?? []).map(c => [c.column_name, timestamp]));
        const rows = pending.get(table).map(row => ({ ...timestamps, ...row }));
        for (const batch of insertBatches(rows)) {
          await sql`INSERT INTO ${sql(`public.${table}`)} ${sql(batch.rows, batch.columns)}`;
        }
        pending.delete(table);
      }
    },
  };
}
