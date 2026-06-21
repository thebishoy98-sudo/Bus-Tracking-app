import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

function allSourceFiles(dir = SRC) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...allSourceFiles(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = allSourceFiles();
const read = (f) => fs.readFileSync(f, 'utf8');

test('the twilio module is deleted', () => {
  assert.equal(fs.existsSync(path.join(SRC, 'twilio.js')), false);
});

test('no source file imports twilio', () => {
  for (const f of files) {
    const src = read(f);
    assert.ok(!/from\s+['"]twilio['"]/.test(src), `${f} imports the twilio package`);
    assert.ok(!/require\(\s*['"]twilio['"]\s*\)/.test(src), `${f} requires twilio`);
    assert.ok(!/['"][.\/]*twilio\.js['"]/.test(src), `${f} imports ./twilio.js`);
  }
});

test('google.js requests only the Calendar scope, not Gmail', () => {
  const src = read(path.join(SRC, 'google.js'));
  assert.match(src, /calendar\.events/);
  assert.ok(!/gmail/i.test(src), 'google.js still references Gmail');
});

test('no source file reads the Gmail inbox', () => {
  for (const f of files) {
    assert.ok(!/fetchVoiceMessages/.test(read(f)), `${f} still references fetchVoiceMessages`);
  }
});

test('config carries no Twilio or Gmail-query configuration', () => {
  const src = read(path.join(SRC, 'config.js'));
  assert.ok(!/TWILIO_/.test(src), 'config still has TWILIO_ vars');
  assert.ok(!/GMAIL_QUERY|gmailQuery/.test(src), 'config still has the Gmail query');
});

test('server exposes no Twilio SMS webhook', () => {
  const src = read(path.join(SRC, 'server.js'));
  assert.ok(!/\/sms\/incoming/.test(src), 'server still mounts /sms/incoming');
  assert.ok(!/twilio/i.test(src), 'server still references twilio');
});
