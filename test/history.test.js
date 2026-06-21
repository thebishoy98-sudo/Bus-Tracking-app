import test from 'node:test';
import assert from 'node:assert/strict';
import { selectComparables } from '../src/history.js';

const history = [
  { service: 'brake pads front', vehicle: 'Honda Civic', low: 200, high: 260, date: '2026-05-01' },
  { service: 'brake job rear', vehicle: 'Toyota Camry', low: 180, high: 240, date: '2026-04-01' },
  { service: 'oil change', vehicle: 'Ford F-150', low: 60, high: 90, date: '2026-03-01' },
  { service: 'tire rotation', vehicle: 'Honda Civic', low: 40, high: 60, date: '2026-02-01' },
];

test('selectComparables ranks by service token overlap', () => {
  const out = selectComparables(history, { service: 'brake pads', limit: 5 });
  assert.ok(out.length >= 2);
  // The brake-related jobs rank above oil change / tire rotation.
  assert.match(out[0].service, /brake/);
  assert.ok(out.every((c) => c.similarity > 0));
  assert.ok(out[0].similarity >= out[1].similarity);
});

test('selectComparables drops non-matching and price-less rows', () => {
  const out = selectComparables(history, { service: 'brake', limit: 5 });
  assert.ok(out.every((c) => /brake/.test(c.service)));
  assert.ok(out.every((c) => c.low != null && c.high != null));
});

test('selectComparables honors the limit', () => {
  const out = selectComparables(history, { service: 'brake', limit: 1 });
  assert.equal(out.length, 1);
});

test('selectComparables returns empty when nothing is similar', () => {
  const out = selectComparables(history, { service: 'transmission rebuild', limit: 5 });
  assert.equal(out.length, 0);
});
