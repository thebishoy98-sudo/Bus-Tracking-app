import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import {
  makeIdempotencyKey,
  enqueueOutbound,
  backoffSeconds,
  drainOutbox,
} from '../src/google-voice/outbox.js';

const NOW = '2026-06-21T10:00:00Z';
const baseConfig = { observationMode: false, sendRatePerMinute: 6, maxSendRetries: 3 };

function okSender() {
  const sent = [];
  return { sent, async send(job) { sent.push(job); return { ok: true }; } };
}

test('makeIdempotencyKey is deterministic and content-sensitive', () => {
  const a = makeIdempotencyKey({ recipient: '9085551212', kind: 'text', body: 'hi', tag: 'confirm:5' });
  const b = makeIdempotencyKey({ recipient: '9085551212', kind: 'text', body: 'hi', tag: 'confirm:5' });
  const c = makeIdempotencyKey({ recipient: '9085551212', kind: 'text', body: 'bye', tag: 'confirm:5' });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('enqueueOutbound is idempotent on the key', () => {
  const store = openDatabase(':memory:').store;
  const key = makeIdempotencyKey({ recipient: '9085551212', kind: 'text', body: 'hi', tag: 't' });
  const first = enqueueOutbound(store, { recipient: '9085551212', body: 'hi', idempotencyKey: key });
  const dup = enqueueOutbound(store, { recipient: '9085551212', body: 'hi', idempotencyKey: key });
  assert.equal(first.inserted, true);
  assert.equal(dup.inserted, false);
  assert.equal(dup.id, first.id);
});

test('backoffSeconds grows exponentially and is capped', () => {
  assert.equal(backoffSeconds(0), 60);
  assert.equal(backoffSeconds(1), 120);
  assert.equal(backoffSeconds(2), 240);
  assert.ok(backoffSeconds(20) <= 3600);
});

test('observation mode sends nothing and leaves rows queued', async () => {
  const store = openDatabase(':memory:').store;
  enqueueOutbound(store, { recipient: '9085551212', body: 'hi', idempotencyKey: 'k1' });
  const sender = okSender();
  const res = await drainOutbox({ store, sender, config: { ...baseConfig, observationMode: true }, now: () => NOW });
  assert.equal(res.observation, true);
  assert.equal(res.sent, 0);
  assert.equal(sender.sent.length, 0);
  assert.equal(store.getOutboxByKey('k1').status, 'queued');
});

test('drain sends queued rows sequentially and confirms them', async () => {
  const store = openDatabase(':memory:').store;
  enqueueOutbound(store, { recipient: '111', body: 'a', idempotencyKey: 'k1' });
  enqueueOutbound(store, { recipient: '222', body: 'b', idempotencyKey: 'k2' });
  const sender = okSender();
  const res = await drainOutbox({ store, sender, config: baseConfig, now: () => NOW });
  assert.equal(res.sent, 2);
  assert.equal(store.getOutboxByKey('k1').status, 'sent');
  assert.equal(store.getOutboxByKey('k2').status, 'sent');
});

test('drain respects the per-cycle send rate limit', async () => {
  const store = openDatabase(':memory:').store;
  enqueueOutbound(store, { recipient: '1', body: 'a', idempotencyKey: 'k1' });
  enqueueOutbound(store, { recipient: '2', body: 'b', idempotencyKey: 'k2' });
  enqueueOutbound(store, { recipient: '3', body: 'c', idempotencyKey: 'k3' });
  const sender = okSender();
  const res = await drainOutbox({ store, sender, config: { ...baseConfig, sendRatePerMinute: 2 }, now: () => NOW });
  assert.equal(res.sent, 2);
  // One row remains queued for the next cycle.
  const statuses = ['k1', 'k2', 'k3'].map((k) => store.getOutboxByKey(k).status);
  assert.equal(statuses.filter((s) => s === 'queued').length, 1);
});

test('drain schedules a backoff retry on transient failure, then fails after max', async () => {
  const store = openDatabase(':memory:').store;
  enqueueOutbound(store, { recipient: '1', body: 'a', idempotencyKey: 'k1' });
  const failing = { async send() { return { ok: false, error: 'network' }; } };

  // Attempt 1 → queued with a retry scheduled.
  await drainOutbox({ store, sender: failing, config: baseConfig, now: () => NOW });
  let row = store.getOutboxByKey('k1');
  assert.equal(row.status, 'queued');
  assert.equal(row.attempts, 1);
  assert.equal(row.next_attempt_at, '2026-06-21T10:01:00Z');
  assert.equal(row.last_error, 'network');

  // Advance past each scheduled retry (60s then 120s) to exhaust attempts.
  await drainOutbox({ store, sender: failing, config: baseConfig, now: () => '2026-06-21T10:02:00Z' });
  assert.equal(store.getOutboxByKey('k1').attempts, 2);
  await drainOutbox({ store, sender: failing, config: baseConfig, now: () => '2026-06-21T10:05:00Z' });
  row = store.getOutboxByKey('k1');
  assert.equal(row.status, 'failed');
  assert.equal(row.attempts, 3);
});

test('drain suspends on login-required and stops processing further rows', async () => {
  const store = openDatabase(':memory:').store;
  enqueueOutbound(store, { recipient: '1', body: 'a', idempotencyKey: 'k1' });
  enqueueOutbound(store, { recipient: '2', body: 'b', idempotencyKey: 'k2' });
  const sender = { async send() { return { ok: false, loginRequired: true }; } };
  const res = await drainOutbox({ store, sender, config: baseConfig, now: () => NOW });
  assert.equal(res.suspended, true);
  assert.equal(res.sent, 0);
  assert.equal(store.getOutboxByKey('k1').status, 'suspended');
  // The second row was never claimed.
  assert.equal(store.getOutboxByKey('k2').status, 'queued');
});

test('drain fails immediately on recipient mismatch without retrying', async () => {
  const store = openDatabase(':memory:').store;
  enqueueOutbound(store, { recipient: '9085551212', body: 'a', idempotencyKey: 'k1' });
  const sender = { sent: 0, async send() { return { ok: false, recipientMismatch: true, selected: '6105557788' }; } };
  await drainOutbox({ store, sender, config: baseConfig, now: () => NOW });
  const row = store.getOutboxByKey('k1');
  assert.equal(row.status, 'failed');
  assert.match(row.last_error, /mismatch/i);
});
