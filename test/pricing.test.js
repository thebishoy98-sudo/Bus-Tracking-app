import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchService,
  parseVehicleAdjustment,
  computeBaseline,
  computeConfidence,
  recommend,
  formatCustomerEstimate,
  formatOwnerRecommendation,
} from '../src/pricing.js';

const entries = [
  {
    id: 1, service: 'brake pads', labor_low: 120, labor_high: 160, parts_low: 60, parts_high: 90,
    vehicle_adjustments: JSON.stringify({ truck: 40, suv: 25 }), fees: 15,
    effective_from: '2026-01-01', effective_to: null,
  },
  {
    id: 2, service: 'oil change', labor_low: 30, labor_high: 40, parts_low: 25, parts_high: 35,
    vehicle_adjustments: null, fees: 5, effective_from: '2026-01-01', effective_to: null,
  },
];

test('matchService finds the best token-overlap entry', () => {
  assert.equal(matchService(entries, 'brake pads replacement').id, 1);
  assert.equal(matchService(entries, 'need an oil change').id, 2);
  assert.equal(matchService(entries, 'transmission rebuild'), null);
});

test('parseVehicleAdjustment matches keyword categories', () => {
  assert.equal(parseVehicleAdjustment(entries[0].vehicle_adjustments, '2019 Ford F-150 truck'), 40);
  assert.equal(parseVehicleAdjustment(entries[0].vehicle_adjustments, 'Honda Civic'), 0);
  assert.equal(parseVehicleAdjustment(null, 'anything'), 0);
});

test('computeBaseline sums labor, parts, fees and vehicle adjustment', () => {
  const b = computeBaseline(entries[0], { vehicle: 'Honda Civic' });
  assert.equal(b.low, 120 + 60 + 15);
  assert.equal(b.high, 160 + 90 + 15);

  const truck = computeBaseline(entries[0], { vehicle: 'Ford F-150 truck' });
  assert.equal(truck.low, 120 + 60 + 15 + 40);
  assert.equal(truck.high, 160 + 90 + 15 + 40);
});

test('computeConfidence reflects evidence strength', () => {
  assert.equal(computeConfidence({ hasEntry: true, comparables: 0 }), 'high');
  assert.equal(computeConfidence({ hasEntry: false, comparables: 2 }), 'medium');
  assert.equal(computeConfidence({ hasEntry: false, comparables: 0 }), 'low');
});

test('recommend uses the price book when a service matches', () => {
  const rec = recommend({ entries, comparables: [], service: 'brake pads', vehicle: 'Honda Civic', onDate: '2026-06-21' });
  assert.equal(rec.matched, true);
  assert.equal(rec.low, 195);
  assert.equal(rec.high, 265);
  assert.equal(rec.confidence, 'high');
});

test('recommend falls back to historical comparables when no entry matches', () => {
  const comparables = [
    { service: 'brake pads', low: 200, high: 260, similarity: 0.9 },
    { service: 'brake job', low: 180, high: 240, similarity: 0.7 },
  ];
  const rec = recommend({ entries, comparables, service: 'alternator replacement', vehicle: 'Civic', onDate: '2026-06-21' });
  assert.equal(rec.matched, false);
  assert.equal(rec.confidence, 'medium');
  assert.equal(rec.low, 190); // avg of 200,180
  assert.equal(rec.high, 250); // avg of 260,240
  assert.ok(rec.comparisons.length === 2);
});

test('recommend yields low confidence and no numbers with no evidence', () => {
  const rec = recommend({ entries, comparables: [], service: 'transmission rebuild', vehicle: '', onDate: '2026-06-21' });
  assert.equal(rec.matched, false);
  assert.equal(rec.confidence, 'low');
  assert.equal(rec.low, null);
  assert.equal(rec.high, null);
});

test('formatCustomerEstimate is explicitly non-binding', () => {
  const body = formatCustomerEstimate({ low: 180, high: 240, service: 'brake pads' });
  assert.match(body, /estimate/i);
  assert.match(body, /not a (final|binding)/i);
  assert.match(body, /180/);
  assert.match(body, /240/);
});

test('formatOwnerRecommendation surfaces range, confidence and the command menu', () => {
  const rec = { matched: true, low: 195, high: 265, confidence: 'high', service: 'brake pads', assumptions: ['from price book'], comparisons: [] };
  const note = formatOwnerRecommendation(rec, { customerName: 'Mara' });
  assert.match(note, /195/);
  assert.match(note, /265/);
  assert.match(note, /high/i);
  assert.match(note, /APPROVE/);
  assert.match(note, /EDIT/);
  assert.match(note, /NOQUOTE/);
});
