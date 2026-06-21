import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboard, validatePriceEntry } from '../src/dashboard.js';

const baseData = {
  shopName: 'Test Auto',
  timezone: 'America/New_York',
  observation: true,
  health: { browserState: 'ready', lastScanAt: '2026-06-21T10:00:00Z', lastScanOk: true, lastError: '' },
  outbox: { queued: 1, sent: 3, failed: 1 },
  failedSends: [{ id: 9, recipient_number: '9085551212', last_error: 'network', status: 'failed' }],
  pendingApprovals: [{ id: 5, kind: 'pricing_approval', payload: JSON.stringify({ low: 180, high: 240, service: 'brakes' }) }],
  messages: [{
    id: 1, sender_number: '9085551212', display_name: 'Mara', body: 'hi', sent_at: '2026-06-21T10:00:00Z',
    status: 'scheduled', attachments: [{ id: 2, file_path: '/data/media/1-0.jpg', status: 'stored', mime: 'image/jpeg' }],
  }],
  priceBook: [{ id: 1, service: 'brake pads', labor_low: 120, labor_high: 160, parts_low: 60, parts_high: 90, fees: 15, effective_from: '2026-01-01', effective_to: null }],
};

test('renderDashboard shows automation health and observation mode', () => {
  const html = renderDashboard(baseData);
  assert.match(html, /ready/i);
  assert.match(html, /observation/i);
});

test('renderDashboard lists pending approvals and failed sends', () => {
  const html = renderDashboard(baseData);
  assert.match(html, /brakes/);
  assert.match(html, /network/);
  // A retry control for the failed send.
  assert.match(html, /\/outbox\/9\/retry/);
});

test('renderDashboard renders media thumbnails via the protected media route', () => {
  const html = renderDashboard(baseData);
  assert.match(html, /\/media\/1-0\.jpg/);
  assert.match(html, /<img/);
});

test('renderDashboard escapes message content to prevent XSS', () => {
  const data = { ...baseData, messages: [{ id: 1, sender_number: '1', display_name: 'x', body: '<script>alert(1)</script>', status: 'new', attachments: [] }] };
  const html = renderDashboard(data);
  assert.ok(!html.includes('<script>alert(1)</script>'), 'raw script must not appear');
  assert.match(html, /&lt;script&gt;/);
});

test('renderDashboard shows the price book with edit/delete controls', () => {
  const html = renderDashboard(baseData);
  assert.match(html, /brake pads/);
  assert.match(html, /\/price\/1/); // edit/delete endpoint
});

test('validatePriceEntry accepts a well-formed entry', () => {
  const r = validatePriceEntry({
    service: 'brake pads', labor_low: '120', labor_high: '160', parts_low: '60', parts_high: '90',
    fees: '15', effective_from: '2026-01-01', effective_to: '',
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.labor_low, 120);
  assert.equal(r.value.effective_to, null);
});

test('validatePriceEntry rejects a missing service', () => {
  const r = validatePriceEntry({ service: '', labor_low: '1', labor_high: '2' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /service/i.test(e)));
});

test('validatePriceEntry rejects non-numeric or negative money', () => {
  assert.equal(validatePriceEntry({ service: 'x', labor_low: 'abc' }).ok, false);
  assert.equal(validatePriceEntry({ service: 'x', labor_low: '-5' }).ok, false);
});

test('validatePriceEntry rejects a malformed effective date', () => {
  const r = validatePriceEntry({ service: 'x', labor_low: '1', labor_high: '2', effective_from: '06/01/2026' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /date/i.test(e)));
});
