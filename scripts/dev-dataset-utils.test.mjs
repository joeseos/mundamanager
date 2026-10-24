import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertLocalDatabase, eligibleVehicleFighters, fixtureAnchor, fixtureId, groupedBy,
  LOCAL_DATABASE_URL, optionsFromArgs, ordinaryEquipment, randomSource } from './dev-dataset-utils.mjs';
import { calculateFighterCost, calculateVehicleCost } from '../utils/fighter-cost.ts';
import { countsTowardRating } from '../utils/fighter-status.ts';
import { createSeedWriter, insertBatches, SEED_BATCH_SIZE } from './dev-dataset-writer.mjs';

test('only the explicit local Supabase database is accepted', () => {
  assertLocalDatabase(LOCAL_DATABASE_URL, 'development');
  assertLocalDatabase(LOCAL_DATABASE_URL.replace('127.0.0.1', 'localhost'), 'development');
  for (const url of [LOCAL_DATABASE_URL.replace('127.0.0.1', 'db.example.com'),
    LOCAL_DATABASE_URL.replace('54322', '5432'), LOCAL_DATABASE_URL.replace('/postgres', '/other'),
    `${LOCAL_DATABASE_URL}?host=remote`, `${LOCAL_DATABASE_URL}#remote`,
    LOCAL_DATABASE_URL.replace('postgres:postgres@', 'service:secret@')]) {
    assert.throws(() => assertLocalDatabase(url, 'development'));
  }
  assert.throws(() => assertLocalDatabase(LOCAL_DATABASE_URL, 'production'));
});

test('defaults preview ten gangs and reject invalid combinations', () => {
  const config = optionsFromArgs([]);
  assert.equal(config.gangs, 10);
  assert.equal(config.apply, false);
  assert.equal(config.databaseUrl, LOCAL_DATABASE_URL);
  for (const args of [['--apply', '--dry-run'], ['--gangs', '0'], ['--gangs', '2.5'],
    ['--fighters-min', '20', '--fighters-max', '8'], ['--edition', 'other'],
    ['--date', '2026-02-30'], ['--seed', ''], ['--unknown']]) {
    assert.throws(() => optionsFromArgs(args));
  }
  assert.equal(optionsFromArgs(['--apply', '--edition', 'n26']).apply, true);
});

test('fixture UUIDs are stable and namespace separated', () => {
  assert.equal(fixtureId('a', 'gang:1'), fixtureId('a', 'gang:1'));
  assert.notEqual(fixtureId('a', 'gang:1'), fixtureId('b', 'gang:1'));
  assert.notEqual(fixtureId('a', 'gang:1'), fixtureId('a', 'gang:2'));
  assert.match(fixtureId('a', 'gang:1'), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('random choices are repeatable, bounded, and do not mutate catalogs', () => {
  const a = randomSource('sector');
  const b = randomSource('sector');
  assert.deepEqual(Array.from({ length: 100 }, () => a.int(1, 6)), Array.from({ length: 100 }, () => b.int(1, 6)));
  const source = [1, 2, 3, 4];
  assert.deepEqual([...a.shuffle(source)].sort(), source);
  assert.deepEqual(source, [1, 2, 3, 4]);
  assert.throws(() => a.pick([]));
  for (let i = 0; i < 100; i++) {
    const value = a.int(2, 4);
    assert.ok(value >= 2 && value <= 4);
  }
});

test('timestamps start at UTC midnight, including morning runs, and reject future dates', () => {
  const morning = Date.parse('2026-10-23T05:00:00Z');
  assert.equal(fixtureAnchor('2026-10-23', morning), Date.parse('2026-10-23T00:00:00Z'));
  assert.ok(fixtureAnchor('2026-10-22', morning) < morning);
  assert.throws(() => fixtureAnchor('2026-10-24', morning), /future/);
  assert.throws(() => fixtureAnchor('2026-02-30', morning), /valid/);
});

test('only own-faction or explicit Available to All vehicles are eligible', () => {
  const types = ['own', 'generic', 'hidden', 'unplayable'].map(id => ({ id, gang_type_id: id, is_vehicle: true }));
  const gangs = [{ id: 'own', gang_type: 'House Escher' }, { id: 'generic', gang_type: 'Available to All', is_hidden: true },
    { id: 'hidden', gang_type: 'Hidden Rival', is_hidden: true }, { id: 'unplayable', gang_type: 'Rival List' }];
  assert.deepEqual(eligibleVehicleFighters(types, gangs, 'own').map(f => f.id), ['own', 'generic']);
});

test('equipment filtering uses beast relationships and explicit equipment types, not names', () => {
  const equipment = [{ id: 'beast', equipment_name: 'Renamed Pet', equipment_type: 'wargear' },
    { id: 'normal', equipment_name: 'Exotic Beast Badge', equipment_type: 'wargear' },
    { id: 'upgrade', equipment_type: 'vehicle_upgrade' }, { id: 'weapon', equipment_type: 'weapon' },
    { id: 'grants', equipment_type: 'wargear', grants_equipment: { example: true } }];
  assert.deepEqual(ordinaryEquipment(equipment, new Set(['beast'])).map(e => e.id), ['normal', 'weapon']);
  assert.equal(groupedBy([{ parent: 'a' }, { parent: 'a' }], 'parent').get('a').length, 2);
});

test('shared costing includes adjustments, effects, skills and vehicles; capture excludes rating, recovery does not', () => {
  const vehicle = { cost: 80, fighter_equipment: [{ purchase_cost: 20 }], fighter_effects: [{ type_specific_data: { credits_increase: 5 } }] };
  const fighter = { credits: 100, cost_adjustment: -5, beast_link: null,
    fighter_equipment: [{ purchase_cost: 15 }], fighter_skills: [{ credits_increase: 10 }],
    fighter_effects: [{ type_specific_data: { credits_increase: 20 } }], vehicles: [vehicle], fighter_exotic_beasts: [] };
  assert.equal(calculateVehicleCost(vehicle), 105);
  assert.equal(calculateFighterCost(fighter), 245);
  assert.equal(calculateFighterCost({ ...fighter, beast_link: { id: 'owner-link' } }), 0);
  const pet = { id: 'pet', fighter_types: { cost: 40 }, cost_adjustment: 1,
    killed: false, retired: false, enslaved: false, captured: false,
    fighter_equipment: [{ purchase_cost: 5 }], fighter_skills: [{ credits_increase: 3 }],
    fighter_effects: [{ type_specific_data: { credits_increase: 2 } }] };
  const link = { fighter_pet_id: pet.id, fighter_equipment: { gang_stash: false }, pet };
  assert.equal(calculateFighterCost({ ...fighter, fighter_exotic_beasts: [link, link] }), 296);
  assert.equal(calculateFighterCost({ ...fighter, fighter_exotic_beasts: [
    { ...link, fighter_equipment: { gang_stash: true } },
  ] }), 291);
  assert.equal(calculateFighterCost({ ...fighter, fighter_exotic_beasts: [
    { ...link, pet: { ...pet, captured: true } },
  ] }), 245);
  assert.equal(countsTowardRating({ captured: true }), false);
  assert.equal(countsTowardRating({ recovery: true }), true);
});

test('insert batches preserve column shapes and bound row/parameter counts', () => {
  const rows = Array.from({ length: 501 }, (_, id) => ({ id, skill_id: `skill-${id}` }));
  rows.push({ id: 502, custom_skill_id: 'custom' });
  const batches = insertBatches(rows);
  assert.equal(SEED_BATCH_SIZE, 250);
  assert.deepEqual(batches.map(batch => batch.rows.length), [250, 250, 1, 1]);
  assert.deepEqual(batches[0].columns, ['id', 'skill_id']);
  assert.deepEqual(batches[3].columns, ['custom_skill_id', 'id']);
  assert.ok(!('skill_id' in batches[3].rows[0]));
  const wideRows = Array.from({ length: 201 }, () => Object.fromEntries(
    Array.from({ length: 300 }, (_, column) => [`column_${column}`, column])));
  assert.deepEqual(insertBatches(wideRows).map(batch => batch.rows.length), [200, 1]);
  assert.deepEqual(insertBatches([]), []);
});

test('empty writer flushes do not query the database and unknown tables fail closed', async () => {
  const writer = createSeedWriter(() => { throw new Error('Unexpected database query'); }, '2020-01-01T00:00:00Z', {});
  await writer.flush();
  assert.throws(() => writer.insert('unreviewed_table', { id: 'example' }), /dependency order/);
});
