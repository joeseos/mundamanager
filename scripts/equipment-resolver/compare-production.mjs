// Compares utils/equipment/resolve.ts with get_equipment_detailed_data on a live database,
// gently. Run it once migration 20261002075353_add_equipment_catalogue.sql and the function
// files are deployed.
//
//   DATABASE_URL=postgres://... node scripts/equipment-resolver/compare-production.mjs \
//     [--per-gang-type 3] [--state compare-state.json] [--max-calls 3000]
//
// Which gangs: the most recently updated gangs of each gang type (--per-gang-type), plus gangs
// whose campaign has custom Trading Posts, gangs with custom fighters, legacy fighters or an
// affiliation, gangs with only a pending campaign row, and gangs that reach another edition's
// Trading Posts. Within a gang, fighters with the same type, custom type, subtypes and legacy
// are compared once; each is checked with the Legacy switch off, and on as well when it can
// matter. The stash and each N23 vehicle type are checked too. Every check runs as the gang's
// owner, as the modal does, because custom equipment depends on the viewer.
//
// How gently (decided for this work):
//   * one database call at a time, at least --gap seconds (4) apart: at most 900 an hour;
//   * only between 05:00 and 09:00 UTC (--any-hour lifts this, for a local database only);
//   * every call in a read-only transaction with a 5-second statement timeout (snapshot files,
//     built once per run and version, get 30 seconds);
//   * a call slower than 2 seconds adds a 60-second pause; three in a row, or any error, stop
//     the run;
//   * at most --max-calls (3,000) calls per run. Progress and differences are kept in --state,
//     so the next run continues where this one stopped.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { checkCase } from './check.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(name);

const db = arg('--db', process.env.DATABASE_URL);
const statePath = arg('--state', 'compare-state.json');
const perGangType = Number(arg('--per-gang-type', '3'));
const maxCalls = Number(arg('--max-calls', '3000'));
const gapMs = Number(arg('--gap', '4')) * 1000;
const anyHour = flag('--any-hour');
if (!db) {
  console.error('Set DATABASE_URL or pass --db.');
  process.exit(2);
}

const SLOW_MS = 2000;
const SLOW_PAUSE_MS = 60_000;
const TABS = ['fighters-list', 'fighters-tradingpost', 'unrestricted'];

const state = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, 'utf8'))
  : { cases: null, done: {}, differences: [], calls: 0 };
const save = () => writeFileSync(statePath, `${JSON.stringify(state, null, 1)}\n`);

// --------------------------------------------------------------------------- database calls

let callsThisRun = 0;
let slowInARow = 0;
let lastCallAt = 0;

function inQuietHours() {
  const hour = new Date().getUTCHours();
  return hour >= 5 && hour < 9;
}

class Stop extends Error {}

/** One read-only, time-boxed statement. Returns the lines it prints that start with '#'. */
async function call(sql, { timeout = '5s', uid = null } = {}) {
  if (!anyHour && !inQuietHours()) throw new Stop('outside 05:00-09:00 UTC');
  if (callsThisRun >= maxCalls) throw new Stop(`reached ${maxCalls} calls`);
  const wait = lastCallAt + gapMs - Date.now();
  if (wait > 0) await sleep(wait);

  const script = [
    'BEGIN TRANSACTION READ ONLY;',
    `SET LOCAL statement_timeout = '${timeout}';`,
    uid ? `SELECT set_config('request.jwt.claim.sub', '${uid}', true) IS NULL;` : '',
    sql,
    'ROLLBACK;',
  ].join('\n');

  const started = Date.now();
  let out;
  try {
    out = execFileSync('psql', [db, '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1'], {
      input: script,
      maxBuffer: 1 << 28,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();
  } catch (error) {
    throw new Stop(`database error: ${error.stderr?.toString().trim() ?? error.message}`);
  } finally {
    lastCallAt = Date.now();
    callsThisRun++;
    state.calls++;
  }

  const took = Date.now() - started;
  if (timeout === '5s' && took > SLOW_MS) {
    slowInARow++;
    console.log(`slow call (${took} ms), pausing`);
    if (slowInARow >= 3) throw new Stop('three slow calls in a row');
    await sleep(SLOW_PAUSE_MS);
  } else {
    slowInARow = 0;
  }
  return out.split('\n').filter((line) => line.startsWith('#'));
}

const q = (v) => (v === null || v === undefined ? 'NULL::uuid' : `'${String(v).replace(/'/g, "''")}'::uuid`);

// --------------------------------------------------------------------------- cases

const CASES_SQL = (n) => `
WITH picked AS (
  SELECT id FROM (
    SELECT g.id, row_number() OVER (PARTITION BY COALESCE(g.gang_type_id, g.custom_gang_type_id) ORDER BY g.last_updated DESC NULLS LAST, g.id) AS rn
    FROM gangs g
  ) r WHERE rn <= ${n}
  UNION
  SELECT cg.gang_id FROM campaign_gangs cg JOIN campaigns c ON c.id = cg.campaign_id
  WHERE jsonb_array_length(COALESCE(c.custom_trading_posts, '[]')) > 0
  UNION
  (SELECT f.gang_id FROM fighters f WHERE f.custom_fighter_type_id IS NOT NULL GROUP BY f.gang_id ORDER BY max(f.updated_at) DESC NULLS LAST LIMIT 40)
  UNION
  (SELECT f.gang_id FROM fighters f WHERE f.fighter_gang_legacy_id IS NOT NULL GROUP BY f.gang_id ORDER BY max(f.updated_at) DESC NULLS LAST LIMIT 40)
  UNION
  (SELECT g.id FROM gangs g WHERE g.gang_affiliation_id IS NOT NULL ORDER BY g.last_updated DESC NULLS LAST LIMIT 40)
  UNION
  (SELECT cg.gang_id FROM campaign_gangs cg WHERE cg.status = 'PENDING' ORDER BY cg.updated_at DESC NULLS LAST LIMIT 20)
  UNION
  SELECT cg.gang_id FROM campaign_gangs cg JOIN campaigns c ON c.id = cg.campaign_id
  JOIN gangs g ON g.id = cg.gang_id JOIN gang_types gt ON gt.gang_type_id = g.gang_type_id
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(c.trading_posts, '[]')) t(id)
  JOIN trading_post_types tpt ON tpt.id = t.id::uuid
  WHERE tpt.edition_id IS DISTINCT FROM gt.edition_id
),
fighter_groups AS (
  SELECT DISTINCT ON (f.gang_id, f.fighter_type_id, f.custom_fighter_type_id, f.fighter_subtypes, f.fighter_gang_legacy_id)
         f.gang_id, f.id, COALESCE(ft.id, f.custom_fighter_type_id) AS type_id,
         (f.fighter_gang_legacy_id IS NOT NULL
          OR f.fighter_subtypes IS DISTINCT FROM COALESCE(ft.fighter_subtypes, cft.fighter_subtypes)) AS legacy_matters
  FROM fighters f
  JOIN picked p ON p.id = f.gang_id
  LEFT JOIN fighter_types ft ON ft.id = f.fighter_type_id
  LEFT JOIN custom_fighter_types cft ON cft.id = f.custom_fighter_type_id
  WHERE COALESCE(ft.id, f.custom_fighter_type_id) IS NOT NULL
  ORDER BY f.gang_id, f.fighter_type_id, f.custom_fighter_type_id, f.fighter_subtypes, f.fighter_gang_legacy_id, f.id
),
vehicles AS (
  SELECT DISTINCT ON (v.gang_id, v.vehicle_type_id) v.gang_id, v.vehicle_type_id, v.fighter_id
  FROM vehicles v JOIN picked p ON p.id = v.gang_id
  WHERE v.vehicle_type_id IS NOT NULL AND v.fighter_id IS NOT NULL
  ORDER BY v.gang_id, v.vehicle_type_id, v.id
)
SELECT '#' || jsonb_build_object('cases', COALESCE(jsonb_agg(c), '[]'))::text FROM (
  SELECT jsonb_build_object('gang', fg.gang_id, 'owner', g.user_id, 'fighter', fg.id, 'typeId', fg.type_id, 'isVehicle', false, 'legacy', l.legacy) AS c
  FROM fighter_groups fg JOIN gangs g ON g.id = fg.gang_id
  CROSS JOIN LATERAL (VALUES (false), (true)) l(legacy)
  WHERE NOT l.legacy OR fg.legacy_matters
  UNION ALL
  SELECT jsonb_build_object('gang', g.id, 'owner', g.user_id, 'fighter', NULL, 'typeId', NULL, 'isVehicle', false, 'legacy', false)
  FROM picked p JOIN gangs g ON g.id = p.id
  UNION ALL
  SELECT jsonb_build_object('gang', v.gang_id, 'owner', g.user_id, 'fighter', v.fighter_id, 'typeId', v.vehicle_type_id, 'isVehicle', true, 'legacy', false)
  FROM vehicles v JOIN gangs g ON g.id = v.gang_id
) x;`;

/** What equipment.tsx sends for a tab, derived from the gang as the modal's page derives it. */
function rpcSql(c, tab) {
  const typeId = q(c.typeId);
  const fighterRecord = c.isVehicle || !c.fighter ? 'false' : c.legacy ? 'true' : 'ctx.gang_affiliation_id IS NOT NULL';
  const combined = c.typeId && !c.isVehicle;
  const flags = {
    'fighters-list': { list: 'true', tp: 'NULL::boolean', campaign: false },
    'fighters-tradingpost': { list: combined ? 'true' : 'NULL::boolean', tp: 'true', campaign: true },
    unrestricted: { list: 'NULL::boolean', tp: 'NULL::boolean', campaign: false },
  }[tab];
  return `
SELECT '#' || COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]'::jsonb)::text
FROM (
  SELECT g.id, g.gang_type_id, g.gang_affiliation_id,
    (SELECT ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(COALESCE(c.trading_posts, '[]')) x)
       FROM campaign_gangs cg JOIN campaigns c ON c.id = cg.campaign_id WHERE cg.gang_id = g.id LIMIT 1) AS tp_ids,
    (SELECT NULLIF(ARRAY(SELECT x::uuid FROM jsonb_array_elements_text(COALESCE(c.custom_trading_posts, '[]')) x), '{}')
       FROM campaign_gangs cg JOIN campaigns c ON c.id = cg.campaign_id WHERE cg.gang_id = g.id LIMIT 1) AS ctp_ids,
    EXISTS (SELECT 1 FROM campaign_gangs cg JOIN campaigns c ON c.id = cg.campaign_id WHERE cg.gang_id = g.id) AS in_campaign
  FROM gangs g WHERE g.id = ${q(c.gang)}
) ctx,
LATERAL public.get_equipment_detailed_data(
  gang_type_id => ctx.gang_type_id,
  fighter_type_id => ${typeId},
  fighter_type_equipment => ${flags.list},
  equipment_tradingpost => ${flags.tp},
  fighter_id => CASE WHEN ${fighterRecord} THEN ${q(c.fighter)} END,
  gang_id => ctx.id,
  campaign_trading_post_type_ids => ${flags.campaign ? 'CASE WHEN ctx.in_campaign THEN ctx.tp_ids END' : 'NULL::uuid[]'},
  campaign_custom_trading_post_ids => ${flags.campaign ? 'ctx.ctp_ids' : 'NULL::uuid[]'}) r;`;
}

// --------------------------------------------------------------------------- snapshot files

const files = { version: null, cores: new Map(), ruleFiles: new Map() };

async function ensureFiles(overlay) {
  if (files.version !== overlay.version) {
    files.version = overlay.version;
    files.cores.clear();
    files.ruleFiles.clear();
  }
  const editions = [overlay.gang.edition, ...overlay.otherEditions].filter(Boolean);
  for (const edition of editions) {
    if (files.cores.has(edition)) continue;
    const [line] = await call(`SELECT '#' || data::text FROM public.get_equipment_catalogue(${q(edition)});`, { timeout: '30s' });
    if (line) files.cores.set(edition, JSON.parse(line.slice(1)));
  }
  for (const [edition, gangType] of overlay.ruleFiles) {
    const key = `${edition}/${gangType}`;
    if (files.ruleFiles.has(key)) continue;
    const [line] = await call(`SELECT '#' || data::text FROM public.get_equipment_catalogue(${q(edition)}, ${q(gangType)});`, { timeout: '30s' });
    if (line) files.ruleFiles.set(key, JSON.parse(line.slice(1)));
  }
}

// --------------------------------------------------------------------------- run

const caseKey = (c) => [c.gang, c.fighter, c.typeId, c.isVehicle, c.legacy].join('|');

try {
  if (!state.cases) {
    const [line] = await call(CASES_SQL(perGangType), { timeout: '30s' });
    state.cases = JSON.parse(line.slice(1)).cases;
    save();
    console.log(`${state.cases.length} cases to compare`);
  }

  for (const c of state.cases) {
    const key = caseKey(c);
    if (state.done[key]) continue;

    const [overlayLine] = await call(
      `SELECT '#' || public.get_equipment_overlay(${q(c.gang)}, ${q(c.fighter)})::text;`,
      { uid: c.owner }
    );
    const overlay = JSON.parse(overlayLine.slice(1));
    await ensureFiles(overlay);

    const expected = {};
    for (const tab of TABS) {
      const [line] = await call(rpcSql(c, tab), { uid: c.owner });
      expected[tab] = JSON.parse(line.slice(1));
    }

    const context = { typeId: c.typeId, isVehicle: c.isVehicle, legacy: c.legacy };
    const diffs = checkCase(files, { overlay, context, expected });
    if (diffs.length > 0) {
      state.differences.push({ case: c, diffs: diffs.slice(0, 20), total: diffs.length });
      console.log(`DIFFERENT ${key}: ${diffs.length} differences`);
    }
    state.done[key] = { rows: Object.values(expected).reduce((n, rows) => n + rows.length, 0), differences: diffs.length };
    save();
  }
  console.log('all cases compared');
} catch (error) {
  if (!(error instanceof Stop)) throw error;
  console.log(`stopped: ${error.message}`);
} finally {
  save();
  const done = Object.values(state.done);
  console.log(
    `${done.length} of ${state.cases?.length ?? '?'} cases compared, ` +
      `${done.reduce((n, d) => n + d.rows, 0)} RPC rows, ${state.differences.length} cases with differences, ` +
      `${callsThisRun} calls this run (${state.calls} in all). State: ${statePath}`
  );
}
