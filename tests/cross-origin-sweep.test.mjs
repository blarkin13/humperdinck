// Security acceptance: every state-changing endpoint that a browser cookie can
// reach must refuse a request from another website, and must refuse it BEFORE
// writing anything to D1. A signed-in victim visiting a hostile page must not
// be able to sign out, approve a device, mint recovery codes, revoke devices,
// file privacy requests, deactivate licenses or start a checkout.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import worker from '../src/model-proxy-worker.js';

globalThis.crypto ||= webcrypto;
const BASE = 'https://humperdinck.studio';
const TOKEN = 'a'.repeat(43);
const hash = value => createHash('sha256').update(value).digest('base64url');
const UUID = '11111111-2222-4333-8444-555555555555';

// A D1 stand-in: a live web session exists for TOKEN; every other read finds
// nothing, and every write is recorded so the test can prove none happened.
function database() {
  const writes = [];
  const user = {id: 'user-1', display_name: 'Victim', email: 'victim@example.com'};
  return {
    writes,
    prepare(sql) {
      return {bind(...args) {
        const statement = {
          async first() {
            if (sql.includes('FROM auth_sessions s JOIN auth_users') && args[0] === hash(TOKEN))
              return {...user, token_hash: args[0], kind: 'web', expires_at: Date.now() / 1000 + 3600};
            if (sql.includes('COUNT(*)')) return {count: 0};
            return null;
          },
          async all() { return {results: []}; },
          async run() {
            // Expired-row cleanup and rate-limit bookkeeping are not user data.
            if (!/^DELETE FROM \w+ WHERE expires_at|auth_rate/.test(sql.trim())) writes.push(sql.trim().split('\n')[0]);
            return {meta: {changes: 1}};
          },
        };
        return statement;
      }};
    },
  };
}

const env = db => ({
  AUTH_DB: db, ACCOUNT_PUBLIC_ORIGIN: BASE, AUTH_RATE_SECRET: 'x'.repeat(32),
  LS_TEST_API_KEY: 'test', LS_TEST_STORE_ID: '1', LS_TEST_VARIANT_ID: '1', LS_TEST_WEBHOOK_SECRET: 'x',
});

const ROUTES = [
  '/api/account/logout',
  '/api/account/device/approve',
  '/api/account/recovery/redeem',
  '/api/account/dashboard/recovery/codes',
  '/api/account/dashboard/connections/revoke-all',
  `/api/account/dashboard/connections/${UUID}/revoke`,
  '/api/account/privacy/requests',
  `/api/account/license/devices/${UUID}/deactivate`,
  '/api/commerce/test/checkout',
  '/analytics/event',
];

const HOSTILE_ORIGINS = [
  ['another website', 'https://evil.example'],
  ['a look-alike subdomain', 'https://humperdinck.studio.evil.example'],
  ['plain http', 'http://humperdinck.studio'],
  ['a sandboxed frame (null)', 'null'],
  ['no Origin header', null],
];

for (const route of ROUTES) {
  for (const [label, origin] of HOSTILE_ORIGINS) {
    test(`${route} refuses ${label} without writing`, async () => {
      const db = database();
      const headers = {
        Cookie: `__Host-humperdinck_session=${TOKEN}`,
        'Content-Type': 'application/json',
      };
      if (origin) headers.Origin = origin;
      const body = JSON.stringify({code: 'ABCD-EFGH', type: 'deletion', kind: 'page_view', path: '/'});
      const response = await worker.fetch(new Request(BASE + route, {method: 'POST', headers, body}), env(db), {waitUntil() {}});
      assert.ok([401, 403].includes(response.status), `${route} from ${label} returned ${response.status}`);
      assert.deepEqual(db.writes, [], `${route} from ${label} wrote to D1 before refusing`);
    });
  }
}

test('the same requests from the real site are not refused for origin reasons', async () => {
  // Guards against the sweep passing only because every route is broken.
  const db = database();
  const response = await worker.fetch(new Request(BASE + '/api/account/logout', {
    method: 'POST',
    headers: {Cookie: `__Host-humperdinck_session=${TOKEN}`, Origin: BASE},
  }), env(db), {waitUntil() {}});
  assert.notEqual(response.status, 403);
  assert.ok(db.writes.some(sql => sql.startsWith('DELETE FROM auth_sessions')), 'logout should delete the session');
});
