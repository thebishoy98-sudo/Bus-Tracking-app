import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhone,
  isOwnerNumber,
  normalizeBody,
  classifyDirection,
  normalizeAttachment,
  fingerprintMessage,
  normalizeMessage,
} from '../src/google-voice/normalize.js';

test('normalizePhone reduces formats to 10 digits', () => {
  assert.equal(normalizePhone('(908) 555-1212'), '9085551212');
  assert.equal(normalizePhone('+1 908-555-1212'), '9085551212');
  assert.equal(normalizePhone('19085551212'), '9085551212');
  assert.equal(normalizePhone('9085551212'), '9085551212');
  assert.equal(normalizePhone('junk'), '');
  assert.equal(normalizePhone(null), '');
});

test('isOwnerNumber matches only the owner line', () => {
  assert.equal(isOwnerNumber('732-822-8376', '7328228376'), true);
  assert.equal(isOwnerNumber('+17328228376', '7328228376'), true);
  assert.equal(isOwnerNumber('9085551212', '7328228376'), false);
  assert.equal(isOwnerNumber('', '7328228376'), false);
});

test('normalizeBody trims and collapses whitespace', () => {
  assert.equal(normalizeBody('  hello   world\n\n'), 'hello world');
  assert.equal(normalizeBody('line1\r\nline2'), 'line1 line2');
  assert.equal(normalizeBody(null), '');
});

test('classifyDirection respects explicit direction then the outgoing flag', () => {
  assert.equal(classifyDirection({ direction: 'outbound' }), 'outbound');
  assert.equal(classifyDirection({ isOutgoing: true }), 'outbound');
  assert.equal(classifyDirection({ isOutgoing: false }), 'inbound');
  assert.equal(classifyDirection({}), 'inbound');
});

test('normalizeAttachment extracts stable metadata and ignores ephemeral urls', () => {
  const att = normalizeAttachment({
    url: 'https://voice.google.com/blob/abc123?ts=999',
    mime: 'image/jpeg', name: 'photo.JPG', byteSize: 4096,
  });
  assert.equal(att.kind, 'image');
  assert.equal(att.mime, 'image/jpeg');
  assert.equal(att.ext, 'jpg');
  assert.equal(att.byteSize, 4096);
  assert.equal(att.name, 'photo.JPG');
  assert.equal(att.url, 'https://voice.google.com/blob/abc123?ts=999');
});

test('normalizeAttachment infers mime from extension when missing', () => {
  const att = normalizeAttachment({ url: 'x/y.png', name: 'y.png' });
  assert.equal(att.mime, 'image/png');
  assert.equal(att.ext, 'png');
});

test('fingerprintMessage is deterministic and stable across repeated scans', () => {
  const raw = {
    conversationId: 'conv-1', senderNumber: '9085551212',
    timestamp: '2026-06-21T10:00:00Z', text: 'Need  brakes\n done',
    attachments: [{ mime: 'image/jpeg', name: 'a.jpg', byteSize: 100 }],
  };
  const fp1 = fingerprintMessage(raw);
  const fp2 = fingerprintMessage({ ...raw, text: 'Need brakes done' }); // normalized-equal
  assert.equal(fp1, fp2, 'whitespace differences must not change the fingerprint');
  assert.match(fp1, /^[0-9a-f]{64}$/);
});

test('fingerprintMessage differs when meaningful content differs', () => {
  const base = {
    conversationId: 'conv-1', senderNumber: '9085551212',
    timestamp: '2026-06-21T10:00:00Z', text: 'brakes', attachments: [],
  };
  const fp = fingerprintMessage(base);
  assert.notEqual(fp, fingerprintMessage({ ...base, text: 'oil change' }));
  assert.notEqual(fp, fingerprintMessage({ ...base, timestamp: '2026-06-21T11:00:00Z' }));
  assert.notEqual(fp, fingerprintMessage({ ...base, senderNumber: '9085550000' }));
  assert.notEqual(fp, fingerprintMessage({ ...base, conversationId: 'conv-2' }));
  assert.notEqual(fp, fingerprintMessage({
    ...base, attachments: [{ mime: 'image/png', name: 'b.png', byteSize: 200 }],
  }));
});

test('fingerprint ignores attachment ordering', () => {
  const a = { mime: 'image/jpeg', name: 'a.jpg', byteSize: 1 };
  const b = { mime: 'image/png', name: 'b.png', byteSize: 2 };
  const base = { conversationId: 'c', senderNumber: '1', timestamp: 't', text: 'x' };
  assert.equal(
    fingerprintMessage({ ...base, attachments: [a, b] }),
    fingerprintMessage({ ...base, attachments: [b, a] }),
  );
});

test('normalizeMessage produces a complete normalized record', () => {
  const msg = normalizeMessage({
    conversationId: 'conv-1', senderNumber: '(908) 555-1212', senderName: 'Mara',
    isOutgoing: false, timestamp: '2026-06-21T10:00:00Z', text: '  hi  there ',
    attachments: [{ url: 'u', mime: 'image/jpeg', name: 'a.jpg', byteSize: 10 }],
  }, '7328228376');

  assert.equal(msg.conversationId, 'conv-1');
  assert.equal(msg.senderNumber, '9085551212');
  assert.equal(msg.senderName, 'Mara');
  assert.equal(msg.direction, 'inbound');
  assert.equal(msg.body, 'hi there');
  assert.equal(msg.isOwner, false);
  assert.equal(msg.hasAttachments, true);
  assert.equal(msg.attachments.length, 1);
  assert.match(msg.fingerprint, /^[0-9a-f]{64}$/);
});

test('normalizeMessage flags the owner line', () => {
  const msg = normalizeMessage({
    conversationId: 'owner', senderNumber: '732-822-8376',
    isOutgoing: false, timestamp: 't', text: 'APPROVE', attachments: [],
  }, '7328228376');
  assert.equal(msg.isOwner, true);
  assert.equal(msg.hasAttachments, false);
});
