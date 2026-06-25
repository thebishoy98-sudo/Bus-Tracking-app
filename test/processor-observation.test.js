import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';

const extractedComplete = {
  is_appointment_request: true,
  has_enough_info: true,
  customer_name: 'Test Customer',
  service: 'oil change',
  vehicle: '2019 Honda Civic',
  start_local: '2026-06-25T14:00:00',
  duration_minutes: 60,
  notes: null,
};

function seedCompleteInbound(store) {
  const convId = store.upsertConversation({
    gv_conversation_id: 't.+19085551212',
    phone_number: '9085551212',
    display_name: 'Test Customer',
    is_owner: 0,
  });
  const res = store.insertInboundMessage({
    conversation_id: convId,
    fingerprint: 'complete-appointment',
    direction: 'inbound',
    sender_number: '9085551212',
    body: 'Can I get an oil change tomorrow at 2?',
    sent_at: '2026-06-24T22:00:00Z',
    has_attachments: 0,
  });
  store.updateInboundMessage(res.id, { extracted: JSON.stringify(extractedComplete) });
  return res.id;
}

test('observation mode observes complete appointments without booking or queueing sends', async () => {
  const store = openDatabase(':memory:').store;
  const messageId = seedCompleteInbound(store);
  const config = {
    observationMode: true,
    ownerNumber: '7328228376',
    shopName: 'Joe’s Auto',
    timezone: 'America/New_York',
    allowedImageMimes: ['image/jpeg'],
    maxImagesPerMessage: 4,
  };

  const { processInbound } = await import('../src/processor.js');
  await processInbound({ store, config });

  const msg = store.getInboundById(messageId);
  assert.equal(msg.status, 'observed');
  assert.equal(store.getOutboxCounts().queued || 0, 0);
  assert.equal(store.hasPendingOwnerAction(), false);
});

test('observation mode computes but does not create job contacts', async () => {
  const store = openDatabase(':memory:').store;
  const messageId = seedCompleteInbound(store);
  const config = {
    observationMode: true,
    ownerNumber: '7328228376',
    shopName: 'Joe’s Auto',
    timezone: 'America/New_York',
    allowedImageMimes: ['image/jpeg'],
    maxImagesPerMessage: 4,
  };
  let contactCalls = 0;

  const { processInbound } = await import('../src/processor.js');
  await processInbound({
    store,
    config,
    contacts: {
      upsertJobContact: async () => {
        contactCalls++;
        return { observation: true, displayName: '2019 Honda Civic - Oil Change' };
      },
    },
  });

  const msg = store.getInboundById(messageId);
  assert.equal(msg.status, 'observed');
  assert.equal(contactCalls, 1);
  assert.match(msg.extracted, /2019 Honda Civic - Oil Change/);
});
