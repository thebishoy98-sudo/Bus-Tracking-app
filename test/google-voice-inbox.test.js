import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../src/db.js';
import {
  parseConversationList,
  parseThread,
  looksLoggedOut,
  pollInbox,
} from '../src/google-voice/inbox.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'google-voice');
const fixture = (name) => fs.readFileSync(path.join(FIX, name), 'utf8');

const OWNER = '7328228376';

// An owner-side conversation (t-1002) thread, inline so the reader has data.
const ownerThread = `
<gv-conversation data-thread-id="t-1002">
  <gv-message-item data-is-outgoing="false" data-sender="732-822-8376">
    <div class="gv-message-text">APPROVE</div>
    <time class="gv-message-time" datetime="2026-06-21T09:30:00Z">9:30 AM</time>
  </gv-message-item>
</gv-conversation>`;

function fakeReader(listHtml) {
  const threads = {
    't-1001': fixture('thread-text.html'),
    't-1002': ownerThread,
    't-1003': fixture('thread-image.html'),
  };
  return {
    opened: [],
    async listConversationsHtml() { return listHtml; },
    async openConversationHtml(id) { this.opened.push(id); return threads[id] || '<gv-conversation></gv-conversation>'; },
  };
}

function testConfig() {
  return {
    mediaPath: fs.mkdtempSync(path.join(os.tmpdir(), 'gv-inbox-media-')),
    allowedImageMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxAttachmentBytes: 1024 * 1024,
    maxImagesPerMessage: 4,
  };
}

test('parseConversationList extracts thread id, phone, name and time', () => {
  const convs = parseConversationList(fixture('conversation-list.html'));
  assert.equal(convs.length, 3);
  assert.equal(convs[0].conversationId, 't-1001');
  assert.equal(convs[0].displayName, 'Mara Lopez');
  assert.match(convs[0].phoneNumber, /908/);
  assert.equal(convs[0].lastMessageAt, '2026-06-21T10:00:00Z');
});

test('looksLoggedOut distinguishes the sign-in page from the inbox', () => {
  assert.equal(looksLoggedOut(fixture('logged-out.html')), true);
  assert.equal(looksLoggedOut(fixture('inbox-empty.html')), false);
  assert.equal(looksLoggedOut(fixture('conversation-list.html')), false);
});

test('parseThread classifies inbound vs outbound text messages', () => {
  const msgs = parseThread(fixture('thread-text.html'), { conversationId: 't-1001' });
  assert.equal(msgs.length, 3);
  assert.equal(msgs[0].isOutgoing, false);
  assert.match(msgs[0].text, /brake pads/);
  assert.equal(msgs[2].isOutgoing, true);
});

test('parseThread extracts image attachment metadata', () => {
  const msgs = parseThread(fixture('thread-image.html'), { conversationId: 't-1003' });
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0].attachments.length, 1);
  const att = msgs[0].attachments[0];
  assert.equal(att.mime, 'image/jpeg');
  assert.equal(att.name, 'tire.jpg');
  assert.equal(att.byteSize, 40960);
  assert.match(att.url, /blob/);
});

test('pollInbox ingests inbound messages, dedupes, and flags the owner', async () => {
  const store = openDatabase(':memory:').store;
  const config = testConfig();
  const reader = fakeReader(fixture('conversation-list.html'));
  const fetched = [];
  const fetchAttachment = async (url) => { fetched.push(url); return Buffer.from('JPEGDATA'); };

  const first = await pollInbox({ reader, store, config, ownerNumber: OWNER, fetchAttachment });
  assert.equal(first.loggedOut, false);
  assert.equal(first.conversations, 3);
  // Mara: 2 inbound (the outbound "see you Tuesday" is skipped). Owner: 1. Dana: 1.
  assert.equal(first.added, 4);

  // Owner conversation is flagged.
  const ownerConv = store.getConversation('t-1002');
  assert.equal(ownerConv.is_owner, 1);
  const customerConv = store.getConversation('t-1001');
  assert.equal(customerConv.is_owner, 0);

  // The image was downloaded, validated, and stored.
  assert.equal(fetched.length, 1);
  const danaConv = store.getConversation('t-1003');
  const danaMsgs = store.getInboundForConversation(danaConv.id);
  const atts = store.getAttachmentsForMessage(danaMsgs[0].id);
  assert.equal(atts.length, 1);
  assert.equal(atts[0].status, 'stored');
  assert.ok(fs.existsSync(atts[0].file_path));

  // A second poll over identical content adds nothing (deterministic dedup).
  const second = await pollInbox({ reader, store, config, ownerNumber: OWNER, fetchAttachment });
  assert.equal(second.added, 0);
});

test('pollInbox returns early when logged out', async () => {
  const store = openDatabase(':memory:').store;
  const reader = fakeReader(fixture('logged-out.html'));
  const res = await pollInbox({ reader, store, config: testConfig(), ownerNumber: OWNER, fetchAttachment: async () => Buffer.from('') });
  assert.equal(res.loggedOut, true);
  assert.equal(res.added, 0);
});

test('pollInbox handles an empty inbox', async () => {
  const store = openDatabase(':memory:').store;
  const reader = fakeReader(fixture('inbox-empty.html'));
  const res = await pollInbox({ reader, store, config: testConfig(), ownerNumber: OWNER, fetchAttachment: async () => Buffer.from('') });
  assert.equal(res.loggedOut, false);
  assert.equal(res.added, 0);
  assert.equal(res.conversations, 0);
});

test('pollInbox records oversized images as rejected without storing bytes', async () => {
  const store = openDatabase(':memory:').store;
  const config = testConfig();
  config.maxAttachmentBytes = 2; // smaller than our fake payload
  const reader = fakeReader(fixture('conversation-list.html'));
  const fetchAttachment = async () => Buffer.from('JPEGDATA');
  await pollInbox({ reader, store, config, ownerNumber: OWNER, fetchAttachment });

  const danaConv = store.getConversation('t-1003');
  const danaMsgs = store.getInboundForConversation(danaConv.id);
  const atts = store.getAttachmentsForMessage(danaMsgs[0].id);
  assert.equal(atts.length, 1);
  assert.equal(atts[0].status, 'rejected');
  assert.equal(atts[0].file_path, null);
});
