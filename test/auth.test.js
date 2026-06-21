import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCredentials, parseBasicAuth, requireAuth, isAuthorized } from '../src/auth.js';

const config = { dashboardUser: 'shop', dashboardPassword: 'hunter2' };

test('verifyCredentials accepts the correct pair', () => {
  assert.equal(verifyCredentials('shop', 'hunter2', config), true);
});

test('verifyCredentials rejects wrong user or password', () => {
  assert.equal(verifyCredentials('shop', 'nope', config), false);
  assert.equal(verifyCredentials('admin', 'hunter2', config), false);
});

test('verifyCredentials handles mismatched lengths without throwing', () => {
  assert.equal(verifyCredentials('s', 'x', config), false);
  assert.equal(verifyCredentials('shopshopshop', 'hunter2hunter2', config), false);
});

test('verifyCredentials denies everything when no password is configured', () => {
  assert.equal(verifyCredentials('shop', '', { dashboardUser: 'shop', dashboardPassword: '' }), false);
  assert.equal(verifyCredentials('', '', { dashboardUser: 'shop', dashboardPassword: '' }), false);
});

test('parseBasicAuth decodes a Basic header', () => {
  const header = 'Basic ' + Buffer.from('shop:hunter2').toString('base64');
  assert.deepEqual(parseBasicAuth(header), { user: 'shop', pass: 'hunter2' });
  assert.equal(parseBasicAuth('Bearer xyz'), null);
  assert.equal(parseBasicAuth(undefined), null);
});

test('isAuthorized reflects the Authorization header', () => {
  const ok = { headers: { authorization: 'Basic ' + Buffer.from('shop:hunter2').toString('base64') } };
  const bad = { headers: { authorization: 'Basic ' + Buffer.from('shop:wrong').toString('base64') } };
  assert.equal(isAuthorized(ok, config), true);
  assert.equal(isAuthorized(bad, config), false);
});

function mockRes() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    set(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    send(b) { this.body = b; return this; },
    end(b) { this.body = b; return this; },
  };
}

test('requireAuth challenges unauthenticated requests with 401', () => {
  const mw = requireAuth(config);
  const res = mockRes();
  let nexted = false;
  mw({ headers: {} }, res, () => { nexted = true; });
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 401);
  assert.match(res.headers['WWW-Authenticate'] || '', /Basic/);
});

test('requireAuth passes authenticated requests through', () => {
  const mw = requireAuth(config);
  const res = mockRes();
  let nexted = false;
  const req = { headers: { authorization: 'Basic ' + Buffer.from('shop:hunter2').toString('base64') } };
  mw(req, res, () => { nexted = true; });
  assert.equal(nexted, true);
  assert.equal(res.statusCode, 200);
});
