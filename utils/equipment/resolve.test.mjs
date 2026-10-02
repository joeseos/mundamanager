// Golden test for utils/equipment/resolve.ts: the resolver must return, for every case and tab,
// the rows get_equipment_detailed_data returned for the synthetic dataset in
// scripts/equipment-resolver/dataset.mjs (seed 1). Each case loads only the snapshot files its
// overlay names, as the modal does.
//
//   npm test
//
// Rebuild the fixture with scripts/equipment-resolver/golden.mjs when the dataset changes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { checkCase, filesFrom, unpackGolden } from '../../scripts/equipment-resolver/check.mjs';

const golden = unpackGolden(
  JSON.parse(gunzipSync(readFileSync(new URL('./__fixtures__/golden.json.gz', import.meta.url))).toString())
);
const files = filesFrom(golden.cores, golden.ruleFiles);

test('the fixture covers every tab, custom items and custom Trading Post terms', () => {
  const rows = golden.cases.flatMap((c) => Object.values(c.expected).flat());
  assert.ok(golden.cases.length >= 30);
  assert.ok(rows.some((r) => r.is_custom));
  assert.ok(rows.some((r) => r.cost_resource_name === 'Reputation'));
  assert.ok(rows.some((r) => r.banned));
  assert.ok(rows.some((r) => r.min_count !== null || r.max_count !== null));
  assert.ok(rows.some((r) => r.vehicle_upgrade_slot !== null));
  assert.ok(rows.some((r) => r.trading_post_names.length > 1));
});

for (const c of golden.cases) {
  test(c.name, () => {
    assert.deepEqual(checkCase(files, c), []);
  });
}
