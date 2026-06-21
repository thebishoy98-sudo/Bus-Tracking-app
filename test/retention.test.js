import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db.js';
import { runRetention } from '../src/retention.js';

let fpSeq = 0;
function seedMessage(store) {
  return store.insertInboundMessage({
    fingerprint: `fp-${fpSeq++}`, direction: 'inbound', sender_number: '9085551212',
    body: 'photo', sent_at: '2026-06-21T10:00:00Z', has_attachments: 1,
  }).id;
}

function setup() {
  const mediaPath = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-ret-media-'));
  const diagnosticsPath = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-ret-diag-'));
  const store = openDatabase(':memory:').store;
  const config = { mediaPath, diagnosticsPath, mediaRetentionDays: 90 };
  return { store, config, mediaPath, diagnosticsPath, msgId: seedMessage(store) };
}

function writeFile(dir, name, { ageDays = 0 } = {}) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, Buffer.from('bytes'));
  if (ageDays) {
    const t = (Date.now() - ageDays * 86400000) / 1000;
    fs.utimesSync(p, t, t);
  }
  return p;
}

const future = (days) => new Date(Date.now() + days * 86400000).toISOString();

test('recent referenced media is preserved', () => {
  const { store, config, mediaPath, msgId } = setup();
  const f = writeFile(mediaPath, 'm1.jpg');
  store.insertAttachment({ message_id: msgId, mime: 'image/jpeg', byte_size: 5, file_path: f, status: 'stored' });

  const res = runRetention({ store, config, now: new Date().toISOString() });
  assert.ok(fs.existsSync(f), 'file within retention window is kept');
  assert.equal(store.getAllAttachments().length, 1);
  assert.equal(res.deletedAttachments, 0);
});

test('attachments past the 90-day window are deleted with their files', () => {
  const { store, config, mediaPath, msgId } = setup();
  const f = writeFile(mediaPath, 'old.jpg');
  store.insertAttachment({ message_id: msgId, mime: 'image/jpeg', byte_size: 5, file_path: f, status: 'stored' });

  const res = runRetention({ store, config, now: future(91) });
  assert.ok(!fs.existsSync(f), 'expired file is removed');
  assert.equal(store.getAllAttachments().length, 0);
  assert.ok(res.deletedAttachments >= 1);
});

test('orphan files are swept while referenced files are preserved', () => {
  const { store, config, mediaPath, msgId } = setup();
  const ref = writeFile(mediaPath, 'ref.jpg');
  store.insertAttachment({ message_id: msgId, mime: 'image/jpeg', byte_size: 5, file_path: ref, status: 'stored' });
  const orphan = writeFile(mediaPath, 'orphan.jpg', { ageDays: 200 });

  runRetention({ store, config, now: new Date().toISOString() });
  assert.ok(fs.existsSync(ref), 'referenced file preserved');
  assert.ok(!fs.existsSync(orphan), 'old orphan file swept');
});

test('diagnostic screenshots are cleaned by age', () => {
  const { store, config, diagnosticsPath } = setup();
  const oldShot = writeFile(diagnosticsPath, 'gv-logged_out-0.png', { ageDays: 200 });
  const freshShot = writeFile(diagnosticsPath, 'gv-error-1.png');

  const res = runRetention({ store, config, now: new Date().toISOString() });
  assert.ok(!fs.existsSync(oldShot), 'old screenshot removed');
  assert.ok(fs.existsSync(freshShot), 'fresh screenshot kept');
  assert.ok(res.deletedScreenshots >= 1);
});

test('files outside the media directory are never deleted', () => {
  const { store, config, msgId } = setup();
  const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-outside-'));
  const external = writeFile(outsideDir, 'secret.bin');
  store.insertAttachment({ message_id: msgId, mime: 'image/jpeg', byte_size: 5, file_path: external, status: 'stored' });

  const res = runRetention({ store, config, now: future(91) });
  assert.ok(fs.existsSync(external), 'a file outside mediaPath must never be unlinked');
  assert.ok(res.skippedOutside >= 1);
});

test('retention records its last result in health', () => {
  const { store, config, msgId } = setup();
  runRetention({ store, config, now: '2026-06-21T03:00:00Z' });
  assert.equal(store.getHealth('last_retention_at'), '2026-06-21T03:00:00Z');
  assert.match(store.getHealth('last_retention_result') || '', /attachments:/);
});
