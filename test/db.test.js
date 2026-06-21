import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';

function freshStore() {
  // Each call gets an isolated in-memory database with the full schema applied.
  return openDatabase(':memory:').store;
}

test('preserves the legacy appointment messages table', () => {
  const store = freshStore();
  assert.equal(store.hasMessage('g1'), false);
  store.insertMessage({
    gmail_id: 'g1', from_number: '5551112222', from_name: 'Pat',
    body: 'hi', received_at: '2026-06-21T10:00:00Z',
  });
  assert.equal(store.hasMessage('g1'), true);
});

test('upserts conversations and looks them up by phone and id', () => {
  const store = freshStore();
  const id = store.upsertConversation({
    gv_conversation_id: 'conv-1', phone_number: '9085551212',
    display_name: 'Mara', is_owner: 0,
  });
  assert.ok(id > 0);
  const byPhone = store.getConversationByPhone('9085551212');
  assert.equal(byPhone.gv_conversation_id, 'conv-1');
  assert.equal(byPhone.display_name, 'Mara');

  // Upsert again updates the display name without creating a duplicate.
  const id2 = store.upsertConversation({
    gv_conversation_id: 'conv-1', phone_number: '9085551212',
    display_name: 'Mara Lopez', is_owner: 0,
  });
  assert.equal(id2, id);
  assert.equal(store.getConversationById(id).display_name, 'Mara Lopez');
});

test('inbound messages dedupe on fingerprint', () => {
  const store = freshStore();
  const convId = store.upsertConversation({
    gv_conversation_id: 'c', phone_number: '9085551212', display_name: 'M', is_owner: 0,
  });
  const row = {
    conversation_id: convId, fingerprint: 'fp-abc', direction: 'inbound',
    sender_number: '9085551212', body: 'brakes please', sent_at: '2026-06-21T10:00:00Z',
    has_attachments: 0,
  };
  const first = store.insertInboundMessage(row);
  assert.equal(first.inserted, true);
  assert.ok(first.id > 0);

  const dup = store.insertInboundMessage(row);
  assert.equal(dup.inserted, false, 'duplicate fingerprint must be rejected');
  assert.equal(store.getNewInbound().length, 1);
  assert.equal(store.hasFingerprint('fp-abc'), true);
});

test('attachments attach to a message and can be listed', () => {
  const store = freshStore();
  const convId = store.upsertConversation({
    gv_conversation_id: 'c', phone_number: '9085551212', display_name: 'M', is_owner: 0,
  });
  const { id: msgId } = store.insertInboundMessage({
    conversation_id: convId, fingerprint: 'fp1', direction: 'inbound',
    sender_number: '9085551212', body: 'see photo', sent_at: '2026-06-21T10:00:00Z',
    has_attachments: 1,
  });
  const attId = store.insertAttachment({
    message_id: msgId, kind: 'image', mime: 'image/jpeg', byte_size: 2048,
    file_path: 'media/fp1-0.jpg', sha256: 'deadbeef', status: 'stored', reject_reason: null,
  });
  assert.ok(attId > 0);
  const list = store.getAttachmentsForMessage(msgId);
  assert.equal(list.length, 1);
  assert.equal(list[0].mime, 'image/jpeg');
  assert.equal(list[0].status, 'stored');
});

test('outbox rejects duplicate idempotency keys', () => {
  const store = freshStore();
  const row = {
    idempotency_key: 'send-1', recipient_number: '9085551212', kind: 'text',
    body: 'You are booked', attachment_path: null,
  };
  const first = store.enqueueOutbox(row);
  assert.equal(first.inserted, true);
  const dup = store.enqueueOutbox(row);
  assert.equal(dup.inserted, false, 'duplicate idempotency key must be rejected');
  assert.equal(dup.id, first.id, 'returns the existing row id on conflict');
});

test('outbox claims queued rows sequentially and confirms sends', () => {
  const store = freshStore();
  store.enqueueOutbox({ idempotency_key: 'a', recipient_number: '111', kind: 'text', body: 'hi' });
  store.enqueueOutbox({ idempotency_key: 'b', recipient_number: '222', kind: 'text', body: 'yo' });

  const now = '2026-06-21T10:00:00Z';
  const claimed = store.claimNextOutbox(now);
  assert.equal(claimed.idempotency_key, 'a');
  assert.equal(store.getOutboxById(claimed.id).status, 'sending');

  // Claimed rows are not handed out again.
  const claimed2 = store.claimNextOutbox(now);
  assert.equal(claimed2.idempotency_key, 'b');

  store.markOutboxSent(claimed.id, now);
  assert.equal(store.getOutboxById(claimed.id).status, 'sent');
});

test('outbox failure schedules a retry until it is suspended', () => {
  const store = freshStore();
  const { id } = store.enqueueOutbox({ idempotency_key: 'x', recipient_number: '111', kind: 'text', body: 'hi' });
  store.markOutboxFailed(id, 'boom', '2026-06-21T10:05:00Z', 'queued');
  const row = store.getOutboxById(id);
  assert.equal(row.status, 'queued');
  assert.equal(row.attempts, 1);
  assert.equal(row.last_error, 'boom');
  assert.equal(row.next_attempt_at, '2026-06-21T10:05:00Z');

  store.markOutboxFailed(id, 'login required', null, 'suspended');
  assert.equal(store.getOutboxById(id).status, 'suspended');
  assert.equal(store.getOutboxById(id).attempts, 2);
});

test('pending owner actions track a single approval lifecycle', () => {
  const store = freshStore();
  const convId = store.upsertConversation({
    gv_conversation_id: 'c', phone_number: '9085551212', display_name: 'M', is_owner: 0,
  });
  const actionId = store.createOwnerAction({
    kind: 'pricing_approval', conversation_id: convId, customer_message_id: null,
    payload: JSON.stringify({ low: 180, high: 240 }),
  });
  assert.ok(actionId > 0);
  assert.equal(store.hasPendingOwnerAction(), true);
  const pending = store.getPendingOwnerAction();
  assert.equal(pending.id, actionId);
  assert.deepEqual(JSON.parse(pending.payload), { low: 180, high: 240 });

  store.resolveOwnerAction(actionId, 'approved');
  assert.equal(store.hasPendingOwnerAction(), false);
  assert.equal(store.getOwnerActionById(actionId).status, 'approved');
});

test('price book returns only rows effective on a given date', () => {
  const store = freshStore();
  store.insertPriceEntry({
    service: 'brake pads', labor_low: 120, labor_high: 160, parts_low: 60, parts_high: 90,
    vehicle_adjustments: JSON.stringify({ truck: 40 }), fees: 15, notes: 'front axle',
    effective_from: '2026-01-01', effective_to: '2026-03-01',
  });
  store.insertPriceEntry({
    service: 'brake pads', labor_low: 130, labor_high: 170, parts_low: 65, parts_high: 95,
    vehicle_adjustments: null, fees: 15, notes: 'updated', effective_from: '2026-03-01', effective_to: null,
  });
  const active = store.getEffectivePriceEntries('2026-06-21');
  assert.equal(active.length, 1);
  assert.equal(active[0].labor_low, 130);
  assert.equal(store.getEffectivePriceEntries('2026-02-01').length, 1);
  assert.equal(store.getEffectivePriceEntries('2025-01-01').length, 0);
});

test('automation health stores and reads back keyed values', () => {
  const store = freshStore();
  store.setHealth('browser_state', 'ready');
  store.setHealth('last_scan_at', '2026-06-21T10:00:00Z');
  assert.equal(store.getHealth('browser_state'), 'ready');
  const all = store.getAllHealth();
  assert.equal(all.browser_state, 'ready');
  assert.equal(all.last_scan_at, '2026-06-21T10:00:00Z');
});
