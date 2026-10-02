// Builds the resolver's golden fixture, or fuzzes the resolver, against get_equipment_detailed_data
// on a local database.
//
//   node scripts/equipment-resolver/golden.mjs --db <postgres url> --write utils/equipment/__fixtures__/golden.json.gz
//   node scripts/equipment-resolver/golden.mjs --db <postgres url> --fuzz 50
//
// The database needs the public schema (supabase/schema/schema.public.sql and its bootstrap),
// migration 20261002075353_add_equipment_catalogue.sql and the current
// supabase/functions/get_equipment_detailed_data.sql, and no catalogue rows of its own. Each
// dataset is inserted, read and rolled back in one transaction, so the database is left as it was.
//
// --write uses seed 1 and stores the snapshot files, each case's overlay and the RPC's rows per
// tab, packed (rows as arrays, overlays shared) and gzipped; utils/equipment/resolve.test.mjs
// checks the resolver against them. --fuzz N checks seeds 1..N directly and prints any
// difference.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import { generateDataset } from './dataset.mjs';
import { checkCase, filesFrom, packGolden } from './check.mjs';

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const db = arg('--db') ?? process.env.DATABASE_URL;
if (!db) {
  console.error('Pass --db <postgres url> or set DATABASE_URL.');
  process.exit(2);
}

const lit = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const uuid = (v) => `${lit(v)}::uuid`;
const uuids = (list) => (list === null || list === undefined ? 'NULL' : `ARRAY[${list.map(lit).join(', ')}]::uuid[]`);
const bool = (v) => (v === null || v === undefined ? 'NULL' : v ? 'true' : 'false');

function rpcCall(body) {
  return `public.get_equipment_detailed_data(
    gang_type_id => ${uuid(body.gang_type_id)},
    fighter_type_id => ${uuid(body.fighter_type_id)},
    fighter_type_equipment => ${bool(body.fighter_type_equipment)},
    equipment_tradingpost => ${bool(body.equipment_tradingpost)},
    fighter_id => ${uuid(body.fighter_id)},
    gang_id => ${uuid(body.gang_id)},
    campaign_trading_post_type_ids => ${uuids(body.campaign_trading_post_type_ids)},
    campaign_custom_trading_post_ids => ${uuids(body.campaign_custom_trading_post_ids)})`;
}

/** Inserts the dataset, reads every file, overlay and RPC result, and rolls back. */
function runDataset(dataset) {
  const parts = ['BEGIN;', 'SET LOCAL session_replication_role = replica;', dataset.sql, 'SET LOCAL session_replication_role = origin;'];
  for (const edition of dataset.editions) {
    parts.push(`SELECT '#core ' || data::text FROM public.get_equipment_catalogue(${uuid(edition)});`);
  }
  for (const [edition, gangType] of dataset.gangTypes) {
    parts.push(`SELECT '#rules ' || data::text FROM public.get_equipment_catalogue(${uuid(edition)}, ${uuid(gangType)});`);
  }
  dataset.cases.forEach((c, i) => {
    parts.push(`SELECT set_config('request.jwt.claim.sub', ${lit(c.viewer)}, true) IS NULL;`);
    const tabs = Object.entries(c.requests)
      .map(([tab, body]) => `${lit(tab)}, (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb) FROM ${rpcCall(body)} r)`)
      .join(',\n      ');
    parts.push(`SELECT '#case ' || jsonb_build_object(
      'index', ${i},
      'overlay', public.get_equipment_overlay(${uuid(c.gang)}, ${uuid(c.fighter)}),
      'rpc', jsonb_build_object(${tabs}))::text;`);
  });
  parts.push('ROLLBACK;');

  let out;
  try {
    out = execFileSync('psql', [db, '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1'], {
      input: parts.join('\n'),
      maxBuffer: 1 << 28,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();
  } catch (error) {
    throw new Error(`psql failed: ${error.stderr?.toString() ?? error.message}`);
  }

  const cores = [];
  const ruleFiles = [];
  const results = [];
  for (const line of out.split('\n')) {
    if (line.startsWith('#core ')) cores.push(JSON.parse(line.slice(6)));
    else if (line.startsWith('#rules ')) ruleFiles.push(JSON.parse(line.slice(7)));
    else if (line.startsWith('#case ')) {
      const { index, overlay, rpc } = JSON.parse(line.slice(6));
      const c = dataset.cases[index];
      results.push({
        name: c.name,
        context: { typeId: c.typeId, isVehicle: c.isVehicle, legacy: c.legacy },
        overlay,
        expected: rpc,
      });
    }
  }
  return { cores, ruleFiles, cases: results };
}

function check(golden) {
  const files = filesFrom(golden.cores, golden.ruleFiles);
  const failures = [];
  let rows = 0;
  for (const c of golden.cases) {
    for (const tab of Object.keys(c.expected)) rows += c.expected[tab].length;
    const diffs = checkCase(files, c);
    if (diffs.length > 0) failures.push({ name: c.name, diffs });
  }
  return { failures, rows };
}

if (arg('--write')) {
  const path = arg('--write');
  const golden = { format: 1, seed: 1, ...runDataset(generateDataset(1)) };
  const { failures, rows } = check(golden);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, gzipSync(JSON.stringify(packGolden(golden)), { level: 9 }));
  console.log(`wrote ${path}: ${golden.cases.length} cases, ${rows} RPC rows, ${failures.length} failing`);
  for (const f of failures) console.log(f.name, JSON.stringify(f.diffs.slice(0, 5)));
  process.exit(failures.length > 0 ? 1 : 0);
}

const n = Number(arg('--fuzz') ?? 0);
if (n > 0) {
  let failed = 0;
  let total = 0;
  for (let seed = 1; seed <= n; seed++) {
    const golden = runDataset(generateDataset(seed));
    const { failures, rows } = check(golden);
    total += rows;
    if (failures.length > 0) {
      failed++;
      console.log(`seed ${seed}: ${failures.length} of ${golden.cases.length} cases differ`);
      for (const f of failures.slice(0, Number(process.env.SHOW_CASES ?? 3))) {
        console.log(' ', f.name, JSON.stringify(f.diffs.slice(0, Number(process.env.SHOW_DIFFS ?? 4))));
      }
    }
  }
  console.log(`${n} seeds, ${total} RPC rows compared, ${failed} seeds with differences`);
  process.exit(failed > 0 ? 1 : 0);
}

console.error('Pass --write <path> or --fuzz <n>.');
process.exit(2);
