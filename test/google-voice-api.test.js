import test from 'node:test';
import assert from 'node:assert/strict';
import { parseApiThreadList, pollInbox } from '../src/google-voice/inbox.js';
import { openDatabase } from '../src/db.js';

const apiList = [
  [
    [
      't.+19085551212',
      1782350000000,
      [
        ['m-in', 1782350000000, '+14079006304', null, 10, null, null, null, null, 'Need brakes tomorrow at 2', null, null, 5, null, null, '+19085551212'],
        ['m-out', 1782350100000, '+14079006304', null, 11, null, null, null, null, 'What car?', null, null, 6, null, null, '+19085551212'],
      ],
    ],
  ],
  'cursor',
  'token',
];

test('parseApiThreadList converts Google Voice API arrays into normalized raw threads', () => {
  const threads = parseApiThreadList(apiList);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].conversationId, 't.+19085551212');
  assert.equal(threads[0].phoneNumber, '+19085551212');
  assert.equal(threads[0].messages.length, 2);
  assert.equal(threads[0].messages[0].text, 'Need brakes tomorrow at 2');
  assert.equal(threads[0].messages[0].isOutgoing, false);
  assert.equal(threads[0].messages[0].timestamp, '2026-06-25T01:13:20.000Z');
  assert.equal(threads[0].messages[1].isOutgoing, true);
});

test('pollInbox ingests inbound messages from the Google Voice API reader without DOM thread scraping', async () => {
  const store = openDatabase(':memory:').store;
  const config = { maxImagesPerMessage: 4 };
  const reader = { listThreadsApi: async () => apiList };

  const result = await pollInbox({ reader, store, config, ownerNumber: '7328228376' });

  assert.deepEqual(result, { loggedOut: false, added: 1, conversations: 1 });
  const recent = store.getRecentInbound(10);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].body, 'Need brakes tomorrow at 2');
  assert.equal(recent[0].sender_number, '9085551212');
});
