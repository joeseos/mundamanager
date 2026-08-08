import assert from 'node:assert/strict';
import test from 'node:test';
import {
  automaticFighterSpecialisation,
  representativeFighterType,
} from './fighterSpecialisationSelection.ts';
import { canAutoSelectFighterSpecialisationWithoutDefault } from '../types/edition.ts';

const specialisedRows = (edition_slug: 'n23' | 'n26') => [
  { id: `${edition_slug}-expensive`, total_cost: 120, edition_slug, specialisation: { id: 'a', specialisation_name: 'A' } },
  { id: `${edition_slug}-cheap`, total_cost: 80, edition_slug, specialisation: { id: 'b', specialisation_name: 'B' } },
];

test('N23 automatically uses the cheapest specialisation when no default exists', () => {
  const rows = specialisedRows('n23');
  const enabled = canAutoSelectFighterSpecialisationWithoutDefault('n23');
  assert.equal(representativeFighterType(rows, enabled)?.id, 'n23-cheap');
  assert.equal(automaticFighterSpecialisation(rows, enabled)?.id, 'n23-cheap');
});

test('N26 requires an explicit specialisation when no default exists', () => {
  const rows = specialisedRows('n26');
  const enabled = canAutoSelectFighterSpecialisationWithoutDefault('n26');
  assert.equal(representativeFighterType(rows, enabled)?.id, 'n26-expensive');
  assert.equal(automaticFighterSpecialisation(rows, enabled), undefined);
});

test('an explicit default row is selected in every edition', () => {
  const defaultRow = { id: 'default', total_cost: 100, edition_slug: 'n26' as const };
  const rows = [...specialisedRows('n26'), defaultRow];
  assert.equal(representativeFighterType(rows, false), defaultRow);
  assert.equal(automaticFighterSpecialisation(rows, false), defaultRow);
});
