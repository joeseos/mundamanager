import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';

export const LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
export const DEVELOPMENT_PASSWORD = 'DevOnly-Underhive-2026!';

export function fixtureAnchor(date, now = Date.now()) {
  const anchor = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(anchor) ||
      new Date(anchor).toISOString().slice(0, 10) !== date) {
    throw new Error('--date must be a valid YYYY-MM-DD date.');
  }
  if (anchor > now) throw new Error('--date cannot be in the future.');
  return anchor;
}

export function groupedBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row[key])) groups.set(row[key], []);
    groups.get(row[key]).push(row);
  }
  return groups;
}

export function eligibleVehicleFighters(fighterTypes, gangTypes, gangTypeId) {
  const genericIds = new Set(gangTypes.filter(g => g.gang_type === 'Available to All').map(g => g.id));
  return fighterTypes.filter(f => f.is_vehicle &&
    (f.gang_type_id === gangTypeId || genericIds.has(f.gang_type_id)));
}

export function ordinaryEquipment(equipment, beastEquipmentIds) {
  return equipment.filter(e => ['weapon', 'wargear'].includes(e.equipment_type) &&
    !beastEquipmentIds.has(e.id) && !e.grants_equipment);
}

export function assertLocalDatabase(value, nodeEnv = process.env.NODE_ENV) {
  const url = new URL(value);
  if (nodeEnv === 'production' || !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '54322' ||
      url.pathname !== '/postgres' || url.username !== 'postgres' || url.search || url.hash) {
    throw new Error('Development fixtures require local postgres on 127.0.0.1:54322/postgres, without connection query parameters, outside NODE_ENV=production.');
  }
  return url;
}

export function optionsFromArgs(args) {
  const { values } = parseArgs({ args, options: {
    help: { type: 'boolean', short: 'h' },
    apply: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    seed: { type: 'string', default: 'underhive' },
    edition: { type: 'string', default: 'n23' },
    gangs: { type: 'string', default: '10' },
    'fighters-min': { type: 'string', default: '8' },
    'fighters-max': { type: 'string', default: '14' },
    battles: { type: 'string', default: '20' },
    date: { type: 'string', default: new Date().toISOString().slice(0, 10) },
    'database-url': { type: 'string', default: LOCAL_DATABASE_URL },
  } });
  if (values.help) return { help: true };
  if (values.apply && values['dry-run']) throw new Error('Choose --apply or --dry-run, not both.');
  if (!values.seed.trim() || values.seed.length > 100) throw new Error('--seed must contain 1–100 characters.');
  if (!['n23', 'n26'].includes(values.edition)) throw new Error('--edition must be n23 or n26.');
  const integer = (name, min, max) => {
    const text = values[name];
    const n = Number(text);
    if (!/^\d+$/.test(text) || !Number.isInteger(n) || n < min || n > max) {
      throw new Error(`--${name} must be an integer between ${min} and ${max}.`);
    }
    return n;
  };
  const config = {
    seed: values.seed, edition: values.edition, gangs: integer('gangs', 2, 50),
    fightersMin: integer('fighters-min', 6, 30), fightersMax: integer('fighters-max', 6, 30),
    battles: integer('battles', 1, 200), date: values.date,
    databaseUrl: values['database-url'], apply: values.apply,
  };
  if (config.fightersMin > config.fightersMax) throw new Error('--fighters-min cannot exceed --fighters-max.');
  fixtureAnchor(config.date);
  assertLocalDatabase(config.databaseUrl);
  return config;
}

export function fixtureId(namespace, label) {
  const bytes = createHash('sha256').update(`${namespace}:${label}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function randomSource(seed) {
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0);
  const next = () => {
    state = (state + 0x6D2B79F5) | 0;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min, max) => min + Math.floor(next() * (max - min + 1));
  const pick = (items) => {
    if (!items.length) throw new Error('Cannot choose from an empty game catalog. Bootstrap Supabase reference data first.');
    return items[int(0, items.length - 1)];
  };
  const shuffle = (items) => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  return { int, pick, shuffle };
}
