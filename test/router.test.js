import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';
import { routeBySender, routeInboundMessage, handleOwnerReply } from '../src/router.js';

const OWNER = '7328228376';
const config = { ownerNumber: OWNER };

test('only the owner line is routed as owner input', () => {
  assert.equal(routeBySender('7328228376', OWNER), 'owner');
  assert.equal(routeBySender('+1 (732) 822-8376', OWNER), 'owner');
  assert.equal(routeBySender('9085551212', OWNER), 'customer');
  assert.equal(routeBySender('', OWNER), 'customer');
});

test('owner line appointment-looking text routes as customer intake', () => {
  const noPending = { getPendingOwnerAction: () => null };
  assert.equal(
    routeInboundMessage({
      store: noPending,
      config,
      senderNumber: OWNER,
      body: 'Toyota Highlander motor mounts this Saturday',
    }),
    'customer',
  );
});

test('owner line approval commands still route as owner input', () => {
  const noPending = { getPendingOwnerAction: () => null };
  assert.equal(routeInboundMessage({ store: noPending, config, senderNumber: OWNER, body: 'APPROVE' }), 'owner');
  assert.equal(routeInboundMessage({ store: noPending, config, senderNumber: OWNER, body: 'EDIT 250-350' }), 'owner');
  assert.equal(routeInboundMessage({ store: noPending, config, senderNumber: OWNER, body: 'NOQUOTE' }), 'owner');
});

test('owner line replies route as owner when a clarification is pending', () => {
  const pendingClarification = { getPendingOwnerAction: (kind) => (kind === 'clarification' ? { id: 1 } : null) };
  assert.equal(
    routeInboundMessage({ store: pendingClarification, config, senderNumber: OWNER, body: 'Saturday at 10am' }),
    'owner',
  );
});

function seedPendingApproval(store, { low = 180, high = 240, service = 'brake pads' } = {}) {
  const convId = store.upsertConversation({
    gv_conversation_id: 'c-1', phone_number: '9085551212', display_name: 'Mara', is_owner: 0,
  });
  const actionId = store.createOwnerAction({
    kind: 'pricing_approval', conversation_id: convId, customer_message_id: null,
    payload: JSON.stringify({ low, high, service }),
  });
  return { convId, actionId };
}

test('APPROVE resolves the pending action and enqueues a non-binding estimate to the customer', () => {
  const store = openDatabase(':memory:').store;
  const { convId, actionId } = seedPendingApproval(store);

  const res = handleOwnerReply({ store, config, text: 'APPROVE' });
  assert.equal(res.matched, true);
  assert.equal(res.action, 'approve');
  assert.equal(store.getOwnerActionById(actionId).status, 'approved');

  const outbox = store.getOutboxCounts();
  assert.equal(outbox.queued, 1);
  const conv = store.getConversationById(convId);
  const row = store.getFailedOutbox(); // none yet
  assert.equal(row.length, 0);
  // The single queued message goes to the customer with non-binding wording.
  const claimed = store.claimNextOutbox('2026-06-21T10:00:00Z');
  assert.equal(claimed.recipient_number, conv.phone_number);
  assert.match(claimed.body, /estimate/i);
  assert.match(claimed.body, /not a (final|binding)/i);
  assert.match(claimed.body, /180/);
  assert.match(claimed.body, /240/);
});

test('EDIT overrides the recommended range', () => {
  const store = openDatabase(':memory:').store;
  seedPendingApproval(store, { low: 180, high: 240 });
  handleOwnerReply({ store, config, text: 'EDIT 200-300' });
  const claimed = store.claimNextOutbox('2026-06-21T10:00:00Z');
  assert.match(claimed.body, /200/);
  assert.match(claimed.body, /300/);
});

test('NOQUOTE resolves the action and sends nothing to the customer', () => {
  const store = openDatabase(':memory:').store;
  const { actionId } = seedPendingApproval(store);
  const res = handleOwnerReply({ store, config, text: 'NOQUOTE' });
  assert.equal(res.action, 'noquote');
  assert.equal(store.getOwnerActionById(actionId).status, 'noquote');
  assert.equal(store.getOutboxCounts().queued || 0, 0);
});

test('an ambiguous owner reply sends a private correction and leaves the action pending', () => {
  const store = openDatabase(':memory:').store;
  const { actionId } = seedPendingApproval(store);
  const res = handleOwnerReply({ store, config, text: 'sounds good to me' });
  assert.equal(res.ambiguous, true);
  assert.equal(store.getOwnerActionById(actionId).status, 'pending');
  // A correction note is queued to the OWNER, not the customer.
  const claimed = store.claimNextOutbox('2026-06-21T10:00:00Z');
  assert.equal(claimed.recipient_number, OWNER);
  assert.match(claimed.body, /APPROVE|EDIT|NOQUOTE/);
});

test('an approval command with no pending action does not message the customer', () => {
  const store = openDatabase(':memory:').store;
  const res = handleOwnerReply({ store, config, text: 'APPROVE' });
  assert.equal(res.matched, false);
  // Only a private owner note may be queued; nothing to a customer.
  const all = store.getOutboxCounts();
  const claimed = store.claimNextOutbox('2026-06-21T10:00:00Z');
  if (claimed) assert.equal(claimed.recipient_number, OWNER);
  assert.ok((all.queued || 0) <= 1);
});

test('a replayed APPROVE does not double-send to the customer', () => {
  const store = openDatabase(':memory:').store;
  seedPendingApproval(store);
  handleOwnerReply({ store, config, text: 'APPROVE' });
  handleOwnerReply({ store, config, text: 'APPROVE' }); // replay
  // Still exactly one customer estimate queued.
  const customerSends = [];
  let row;
  while ((row = store.claimNextOutbox('2026-06-21T10:00:00Z'))) {
    if (row.recipient_number === '9085551212') customerSends.push(row);
  }
  assert.equal(customerSends.length, 1);
});
