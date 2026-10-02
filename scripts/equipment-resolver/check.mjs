// Compares utils/equipment/resolve.ts with get_equipment_detailed_data for one modal context.
// Shared by the golden test (utils/equipment/resolve.test.mjs), the fuzz runs (golden.mjs) and
// the production comparison (compare-production.mjs).

import {
  EQUIPMENT_TABS,
  buildCatalogueIndex,
  catalogueFilesFor,
  equipmentForTab,
  resolveEquipment,
} from '../../utils/equipment/resolve.ts';

/** RPC columns the modal does not read, and the resolver does not return. */
const IGNORED = new Set(['created_at', 'is_editable']);

/** JSON with object keys sorted, so key order (jsonb sorts keys its own way) does not matter. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * The RPC aggregates grant options without an ORDER BY, so their order depends on the query
 * plan (on production it differs from the stored order for 8 of 9 items with several options).
 * The snapshot keeps the stored order on purpose, so options are compared as a set.
 */
function sortGrantOptions(grants) {
  if (!grants || !Array.isArray(grants.options)) return grants;
  const options = [...grants.options].sort((a, b) => canonical(a).localeCompare(canonical(b)));
  return { ...grants, options };
}

function normalise(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) if (!IGNORED.has(key)) out[key] = value;
  out.grants_equipment = sortGrantOptions(out.grants_equipment ?? null);
  return JSON.parse(JSON.stringify(out));
}

/**
 * The RPC returns DISTINCT rows, and the modal keeps the first row per item. Rows are compared
 * by id.
 */
function byId(rows) {
  const map = new Map();
  for (const row of rows) if (!map.has(row.id)) map.set(row.id, normalise(row));
  return map;
}

/**
 * files: { cores: Map<edition, core>, ruleFiles: Map<`${edition}/${gangType}`, file> }
 * testCase: { name, context: { typeId, isVehicle, legacy }, overlay, expected: { tab: rows } }
 * Loads only the files the overlay names, as the modal does. Returns a list of differences.
 */
export function checkCase(files, testCase) {
  const { overlay, context, expected } = testCase;
  const wanted = catalogueFilesFor(overlay);
  const diffs = [];

  const cores = [];
  for (const edition of wanted.coreEditions) {
    const core = files.cores.get(edition);
    if (core) cores.push(core);
    else diffs.push({ tab: '*', id: null, problem: `core file ${edition} not available` });
  }
  const ruleFiles = [];
  for (const [edition, gangType] of wanted.ruleFiles) {
    const file = files.ruleFiles.get(`${edition}/${gangType}`);
    if (file) ruleFiles.push(file);
    else diffs.push({ tab: '*', id: null, problem: `rule file ${edition}/${gangType} not available` });
  }

  const resolved = resolveEquipment(buildCatalogueIndex(cores, ruleFiles), overlay, context);
  for (const tab of EQUIPMENT_TABS) {
    if (!expected[tab]) continue;
    const want = byId(expected[tab]);
    const got = byId(equipmentForTab(resolved, tab));
    for (const [id, row] of want) {
      const mine = got.get(id);
      if (!mine) {
        diffs.push({ tab, id, problem: 'missing', name: row.equipment_name });
        continue;
      }
      for (const key of Object.keys(row)) {
        if (canonical(row[key]) !== canonical(mine[key])) {
          diffs.push({ tab, id, problem: 'value', name: row.equipment_name, field: key, rpc: row[key], resolver: mine[key] });
        }
      }
      for (const key of Object.keys(mine)) {
        if (!(key in row)) diffs.push({ tab, id, problem: 'extra field', field: key });
      }
    }
    for (const [id, row] of got) {
      if (!want.has(id)) diffs.push({ tab, id, problem: 'extra', name: row.equipment_name });
    }
  }
  return diffs;
}

export function filesFrom(cores, ruleFiles) {
  return {
    cores: new Map(cores.map((core) => [core.edition, core])),
    ruleFiles: new Map(ruleFiles.map((file) => [`${file.edition}/${file.gangType}`, file])),
  };
}

/** Rows as arrays in one column order, and each distinct overlay stored once. */
export function packGolden(golden) {
  const columns = [];
  for (const c of golden.cases) {
    for (const rows of Object.values(c.expected)) {
      for (const row of rows) for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
    }
  }
  const overlays = [];
  const overlayIndex = new Map();
  const cases = golden.cases.map((c) => {
    const key = JSON.stringify(c.overlay);
    if (!overlayIndex.has(key)) {
      overlayIndex.set(key, overlays.length);
      overlays.push(c.overlay);
    }
    const expected = {};
    for (const [tab, rows] of Object.entries(c.expected)) {
      expected[tab] = rows.map((row) => columns.map((col) => (col in row ? row[col] : null)));
    }
    return { name: c.name, context: c.context, overlay: overlayIndex.get(key), expected };
  });
  return { format: golden.format, seed: golden.seed, columns, cores: golden.cores, ruleFiles: golden.ruleFiles, overlays, cases };
}

export function unpackGolden(packed) {
  return {
    format: packed.format,
    seed: packed.seed,
    cores: packed.cores,
    ruleFiles: packed.ruleFiles,
    cases: packed.cases.map((c) => {
      const expected = {};
      for (const [tab, rows] of Object.entries(c.expected)) {
        expected[tab] = rows.map((values) => Object.fromEntries(packed.columns.map((col, i) => [col, values[i]])));
      }
      return { name: c.name, context: c.context, overlay: packed.overlays[c.overlay], expected };
    }),
  };
}
