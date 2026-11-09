// Security acceptance (runtime): recovery codes work exactly once, even when
// replayed in parallel; recovery attempts are rate limited per IP; and ten Pro
// device slots can't be exceeded by simultaneous activations. Runs the
// Worker's real SQL on SQLite built from the repo migrations.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, webcrypto} from 'node:crypto';
import {handleAccount} from '../src/account-auth.js';
import {sqliteD1} from './helpers/d1-sqlite.mjs';

globalThis.crypto ||= webcrypto;
const BASE = 'https://humperdinck.studio';
const USER = '0b9b6a2e-1c3d-4e5f-8a7b-9c0d1e2f3a4b';
const hash = v => createHash('sha256').update(v).digest('base64url');
const now = () => Math.floor(Date.now() / 1000);

async function world({devices = 0, maxDevices = 10} = {}) {
  const db = sqliteD1();
  db.raw.prepare('INSERT INTO auth_users (id,display_name,email,created_at) VALUES (?,?,?,?)').run(USER, 'T', 't@example.com', now());
  const addSession = (token, kind) => db.raw.prepare(
    'INSERT INTO auth_sessions (token_hash,user_id,kind,created_at,expires_at) VALUES (?,?,?,?,?)').run(hash(token), USER, kind, now(), now() + 3600);
  addSession('w'.repeat(43), 'web');
  addSession('d'.repeat(43), 'desktop');
  db.raw.prepare("INSERT INTO pro_licenses (id,user_id,status,issued_at,max_devices,provider,purchase_ref) VALUES ('lic-1',?,'active',?,?,'test','t')").run(USER, now(), maxDevices);
  for (let i = 0; i < devices; i++) db.raw.prepare(
    'INSERT INTO pro_devices (id,license_id,installation_id,label,activated_at,last_seen_at,deactivated_at) VALUES (?,?,?,?,?,?,NULL)')
    .run(crypto.randomUUID(), 'lic-1', crypto.randomUUID(), 'PC ' + i, now(), now());
  const pair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const priv = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
  return {db, env: {AUTH_DB: db, ACCOUNT_PUBLIC_ORIGIN: BASE, AUTH_RATE_SECRET: 's'.repeat(32), PRO_LICENSE_ED25519_PRIVATE: priv}};
}

const post = (env, path, data, headers = {}) => handleAccount(new Request(BASE + path, {method: 'POST',
  headers: {'Content-Type': 'application/json', ...headers}, body: JSON.stringify(data ?? {})}), env);
const web = {Cookie: '__Host-humperdinck_session=' + 'w'.repeat(43), Origin: BASE};
const desktop = {Authorization: 'Bearer ' + 'd'.repeat(43)};

async function recoveryCodes(env) {
  const response = await post(env, '/api/account/dashboard/recovery/codes', {}, web);
  assert.equal(response.status, 200);
  return (await response.json()).codes;
}
const redeem = (env, code, ip = '203.0.113.1') =>
  post(env, '/api/account/recovery/redeem', {account_id: USER, code}, {Origin: BASE, 'CF-Connecting-IP': ip});

test('a recovery code signs in once, then is refused on replay', async () => {
  const {env} = await world();
  const [code] = await recoveryCodes(env);
  assert.equal((await redeem(env, code)).status, 200);
  assert.equal((await redeem(env, code)).status, 401);
});

test('the same recovery code redeemed 5 times at once works exactly once', async () => {
  const {env} = await world();
  const [code] = await recoveryCodes(env);
  const results = await Promise.all(Array.from({length: 5}, (_, i) => redeem(env, code, '198.51.100.' + i)));
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal(results.filter(r => r.status === 401).length, 4);
});

test('generating a new recovery kit invalidates the old unused codes', async () => {
  const {env} = await world();
  const [old] = await recoveryCodes(env);
  const [fresh] = await recoveryCodes(env);
  assert.equal((await redeem(env, old)).status, 401);
  assert.equal((await redeem(env, fresh)).status, 200);
});

test('recovery guessing is capped at 6 attempts per IP per 10 minutes', async () => {
  const {env} = await world();
  const statuses = [];
  for (let i = 0; i < 8; i++) statuses.push((await redeem(env, 'x'.repeat(32))).status);
  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 401, 429, 429]);
  // Another address is not locked out by the first one's attempts.
  assert.equal((await redeem(env, 'x'.repeat(32), '192.0.2.99')).status, 401);
});

test('simultaneous activations on 9 of 10 used slots fill exactly one', async () => {
  const {db, env} = await world({devices: 9});
  const results = await Promise.all(Array.from({length: 5}, (_, i) =>
    post(env, '/api/account/license/activate', {installation_id: crypto.randomUUID(), label: 'New ' + i}, desktop)));
  assert.equal(results.filter(r => r.status === 200).length, 1);
  assert.equal(results.filter(r => r.status === 409).length, 4);
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM pro_devices WHERE license_id='lic-1' AND deactivated_at IS NULL").get().n, 10);
});

test('re-activating an already active device does not use another slot', async () => {
  const {db, env} = await world({devices: 0});
  const id = crypto.randomUUID();
  for (let i = 0; i < 3; i++)
    assert.equal((await post(env, '/api/account/license/activate', {installation_id: id, label: 'Mac'}, desktop)).status, 200);
  assert.equal(db.raw.prepare("SELECT COUNT(*) n FROM pro_devices WHERE license_id='lic-1'").get().n, 1);
});

test('a web cookie cannot activate a device (desktop connection only)', async () => {
  const {env} = await world();
  const response = await post(env, '/api/account/license/activate', {installation_id: crypto.randomUUID(), label: 'X'}, web);
  assert.equal(response.status, 403);
});
