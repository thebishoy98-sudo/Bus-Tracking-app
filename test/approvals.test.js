import test from 'node:test';
import assert from 'node:assert/strict';
import { parseApprovalCommand } from '../src/approvals.js';

test('APPROVE is recognized regardless of case and surrounding space', () => {
  assert.equal(parseApprovalCommand('APPROVE').type, 'approve');
  assert.equal(parseApprovalCommand('  approve ').type, 'approve');
  assert.equal(parseApprovalCommand('Approve').type, 'approve');
});

test('NOQUOTE is recognized', () => {
  assert.equal(parseApprovalCommand('NOQUOTE').type, 'noquote');
  assert.equal(parseApprovalCommand('no quote').type, 'noquote');
});

test('EDIT with a single amount sets an exact figure', () => {
  const cmd = parseApprovalCommand('EDIT 200');
  assert.equal(cmd.type, 'edit');
  assert.equal(cmd.low, 200);
  assert.equal(cmd.high, 200);
});

test('EDIT with a range parses low and high', () => {
  for (const text of ['EDIT 180-240', 'EDIT $180 - $240', 'EDIT 180 to 240', 'edit 180–240']) {
    const cmd = parseApprovalCommand(text);
    assert.equal(cmd.type, 'edit', `for "${text}"`);
    assert.equal(cmd.low, 180, `low for "${text}"`);
    assert.equal(cmd.high, 240, `high for "${text}"`);
  }
});

test('ambiguous replies are rejected as unknown', () => {
  for (const text of ['sure', 'yes', 'ok sounds good', 'maybe approve it', 'go ahead', '']) {
    assert.equal(parseApprovalCommand(text).type, 'unknown', `for "${text}"`);
  }
});

test('EDIT without a number is unknown', () => {
  assert.equal(parseApprovalCommand('EDIT').type, 'unknown');
  assert.equal(parseApprovalCommand('EDIT a lot').type, 'unknown');
});

test('a high value below the low value is normalized', () => {
  const cmd = parseApprovalCommand('EDIT 240-180');
  assert.equal(cmd.low, 180);
  assert.equal(cmd.high, 240);
});
