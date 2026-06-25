import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db.js';

test('appointment-looking texts from owner number are processed as customer intake', async () => {
  const store = openDatabase(':memory:').store;
  const convId = store.upsertConversation({
    gv_conversation_id: 't.+17328228376',
    phone_number: '7328228376',
    display_name: 'Owner Assistant',
    is_owner: 1,
  });
  const inserted = store.insertInboundMessage({
    conversation_id: convId,
    fingerprint: 'owner-assistant-appointment',
    direction: 'inbound',
    sender_number: '7328228376',
    body: 'Toyota Highlander motor mounts Saturday at 10',
    sent_at: '2026-06-25T03:00:00Z',
    has_attachments: 0,
  });
  const config = {
    observationMode: true,
    ownerNumber: '7328228376',
    shopName: 'Joe’s Auto',
    timezone: 'America/New_York',
    allowedImageMimes: ['image/jpeg'],
    maxImagesPerMessage: 4,
  };

  const { processInbound } = await import('../src/processor.js');
  await processInbound({
    store,
    config,
    extractors: {
      extractAppointment: async () => ({
        is_appointment_request: true,
        has_enough_info: true,
        service: 'motor mounts',
        vehicle: 'Toyota Highlander',
        start_local: '2026-06-27T10:00:00',
        duration_minutes: 60,
        notes: null,
      }),
    },
    contacts: {
      upsertJobContact: async () => ({ observation: true, displayName: 'Toyota Highlander - Motor Mounts' }),
    },
  });

  const msg = store.getInboundById(inserted.id);
  assert.equal(msg.status, 'observed');
  assert.match(msg.extracted, /Toyota Highlander - Motor Mounts/);
  assert.equal(store.getOutboxCounts().queued || 0, 0);
});
