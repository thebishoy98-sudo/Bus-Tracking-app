import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateAttachment, storeAttachment, resolveMediaPath } from '../src/media.js';

function tmpConfig() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gv-media-'));
  return {
    mediaPath: dir,
    allowedImageMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    maxAttachmentBytes: 1024,
  };
}

test('validateAttachment accepts allowlisted images within the size limit', () => {
  const config = tmpConfig();
  assert.deepEqual(validateAttachment({ mime: 'image/jpeg', byteSize: 500 }, config), { ok: true });
});

test('validateAttachment rejects unsupported types', () => {
  const config = tmpConfig();
  const r = validateAttachment({ mime: 'application/zip', byteSize: 10 }, config);
  assert.equal(r.ok, false);
  assert.match(r.reason, /unsupported/i);
});

test('validateAttachment rejects oversized files', () => {
  const config = tmpConfig();
  const r = validateAttachment({ mime: 'image/png', byteSize: 999999 }, config);
  assert.equal(r.ok, false);
  assert.match(r.reason, /large|size/i);
});

test('storeAttachment writes bytes atomically and returns a sha256', async () => {
  const config = tmpConfig();
  const buffer = Buffer.from('hello image bytes');
  const stored = await storeAttachment({ buffer, mime: 'image/jpeg', ext: 'jpg', messageId: 7, index: 0 }, config);

  assert.ok(fs.existsSync(stored.filePath), 'file is written to disk');
  assert.equal(stored.byteSize, buffer.length);
  assert.equal(stored.sha256, crypto.createHash('sha256').update(buffer).digest('hex'));
  assert.deepEqual(fs.readFileSync(stored.filePath), buffer);
  // The file lives inside the configured media directory.
  assert.ok(path.resolve(stored.filePath).startsWith(path.resolve(config.mediaPath)));
  // No stray temp file is left behind.
  const leftovers = fs.readdirSync(config.mediaPath).filter((f) => f.endsWith('.tmp'));
  assert.equal(leftovers.length, 0);
});

test('storeAttachment enforces the byte limit on the actual buffer', async () => {
  const config = tmpConfig();
  config.maxAttachmentBytes = 4;
  await assert.rejects(
    () => storeAttachment({ buffer: Buffer.from('too many bytes'), mime: 'image/png', ext: 'png', messageId: 1, index: 0 }, config),
    /large|size/i,
  );
});

test('resolveMediaPath refuses to escape the media directory', () => {
  const config = tmpConfig();
  assert.throws(() => resolveMediaPath(config, '../../etc/passwd'), /outside|escape|invalid/i);
  const ok = resolveMediaPath(config, 'safe.jpg');
  assert.ok(path.resolve(ok).startsWith(path.resolve(config.mediaPath)));
});
