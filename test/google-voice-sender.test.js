import test from 'node:test';
import assert from 'node:assert/strict';
import { sendMessage } from '../src/google-voice/sender.js';

// A fake composer driver that records the call sequence.
function fakeDriver({ state = 'ready', selected = '9085551212', confirm = true } = {}) {
  const calls = [];
  return {
    calls,
    async ensureReady() { calls.push('ensureReady'); return state; },
    async openConversation(r) { calls.push(`open:${r}`); },
    async readSelectedRecipient() { calls.push('readRecipient'); return selected; },
    async typeMessage(b) { calls.push(`type:${b}`); },
    async attachImage(p) { calls.push(`attach:${p}`); },
    async submit() { calls.push('submit'); },
    async confirmSent() { calls.push('confirm'); return confirm; },
  };
}

test('sends a text message when the recipient matches', async () => {
  const driver = fakeDriver({ selected: '(908) 555-1212' });
  const res = await sendMessage(driver, { recipient: '9085551212', body: 'You are booked', kind: 'text' });
  assert.equal(res.ok, true);
  assert.deepEqual(driver.calls, [
    'ensureReady', 'open:9085551212', 'readRecipient', 'type:You are booked', 'submit', 'confirm',
  ]);
});

test('attaches an image for image sends', async () => {
  const driver = fakeDriver();
  const res = await sendMessage(driver, { recipient: '9085551212', body: 'see this', kind: 'image', attachmentPath: '/data/media/1-0.jpg' });
  assert.equal(res.ok, true);
  assert.ok(driver.calls.includes('attach:/data/media/1-0.jpg'));
  // Attach happens before submit.
  assert.ok(driver.calls.indexOf('attach:/data/media/1-0.jpg') < driver.calls.indexOf('submit'));
});

test('aborts before submitting when the selected recipient does not match', async () => {
  const driver = fakeDriver({ selected: '6105557788' });
  const res = await sendMessage(driver, { recipient: '9085551212', body: 'hi', kind: 'text' });
  assert.equal(res.ok, false);
  assert.equal(res.recipientMismatch, true);
  assert.equal(res.selected, '6105557788');
  assert.equal(driver.calls.includes('submit'), false, 'must never submit to the wrong recipient');
});

test('reports login required when the session is not ready', async () => {
  const driver = fakeDriver({ state: 'logged_out' });
  const res = await sendMessage(driver, { recipient: '9085551212', body: 'hi', kind: 'text' });
  assert.equal(res.ok, false);
  assert.equal(res.loginRequired, true);
  assert.equal(driver.calls.includes('open:9085551212'), false);
});

test('reports challenge state as login required', async () => {
  const driver = fakeDriver({ state: 'challenged' });
  const res = await sendMessage(driver, { recipient: '9085551212', body: 'hi', kind: 'text' });
  assert.equal(res.loginRequired, true);
});

test('fails when the send is not confirmed by the UI', async () => {
  const driver = fakeDriver({ confirm: false });
  const res = await sendMessage(driver, { recipient: '9085551212', body: 'hi', kind: 'text' });
  assert.equal(res.ok, false);
  assert.match(res.error, /confirm/i);
});
