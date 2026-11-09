// Security acceptance: an expired login can't be used, whether it arrives as a
// browser cookie or a desktop bearer token. Runs the Worker's real SQL against
// a real SQLite database built from the repository's migrations, so a mistake
// in the expiry condition itself would be caught (not just in a mock).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash, webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {handleAccount} from '../src/account-auth.js';

globalThis.crypto ||= webcrypto;
const BASE = 'https://humperdinck.studio';
const hash = value => createHash('sha256').update(value).digest('base64url');
const nowSeconds = () => Math.floor(Date.now() / 1000);

// Minimal D1 interface over node:sqlite.
function d1() {
  const db = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).sort())
    db.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({results: db.prepare(sql).all(...args)}),
    run: async () => ({meta: {changes: Number(db.prepare(sql).run(...args).changes)}}),
  });
  return {raw: db, prepare: sql => statement(sql),
    batch: async list => Promise.all(list.map(s => s.run()))};
}

function setup() {
  const db = d1();
  db.raw.prepare('INSERT INTO auth_users (id,display_name,email,created_at) VALUES (?,?,?,?)')
    .run('u1', 'Tester', 'tester@example.com', nowSeconds());
  const add = (token, kind, expires) => db.raw.prepare(
    'INSERT INTO auth_sessions (token_hash,user_id,kind,created_at,expires_at) VALUES (?,?,?,?,?)')
    .run(hash(token), 'u1', kind, nowSeconds() - 7200, expires);
  return {db, add, env: {AUTH_DB: db, ACCOUNT_PUBLIC_ORIGIN: BASE, AUTH_RATE_SECRET: 'x'.repeat(32)}};
}

const token = letter => letter.repeat(43);
const me = (env, headers) => handleAccount(new Request(BASE + '/api/account/me', {headers}), env).then(r => r.json());

test('a live web cookie is accepted (control)', async () => {
  const {add, env} = setup();
  add(token('a'), 'web', nowSeconds() + 3600);
  const body = await me(env, {Cookie: `__Host-humperdinck_session=${token('a')}`});
  assert.equal(body.authenticated, true);
});

test('an expired web cookie is refused', async () => {
  const {add, env} = setup();
  add(token('b'), 'web', nowSeconds() - 1);
  const body = await me(env, {Cookie: `__Host-humperdinck_session=${token('b')}`});
  assert.equal(body.authenticated, false);
});

test('a session expiring this very second is already refused', async () => {
  const {add, env} = setup();
  add(token('c'), 'web', nowSeconds());
  const body = await me(env, {Cookie: `__Host-humperdinck_session=${token('c')}`});
  assert.equal(body.authenticated, false);
});

test('an expired desktop bearer token is refused', async () => {
  const {add, env} = setup();
  add(token('d'), 'desktop', nowSeconds() - 60);
  const body = await me(env, {Authorization: `Bearer ${token('d')}`});
  assert.equal(body.authenticated, false);
});

test('an expired session cannot sign out or change anything', async () => {
  const {db, add, env} = setup();
  add(token('e'), 'web', nowSeconds() - 60);
  const response = await handleAccount(new Request(BASE + '/api/account/logout', {method: 'POST',
    headers: {Cookie: `__Host-humperdinck_session=${token('e')}`, Origin: BASE}}), env);
  assert.ok(response.status < 500);
  // The expired row is untouched by the request itself (cleanup is separate).
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get().n, 1);
});

test('a malformed or unknown token is refused', async () => {
  const {env} = setup();
  for (const headers of [
    {Cookie: '__Host-humperdinck_session=short'},
    {Authorization: 'Bearer ' + token('z')},
    {Authorization: 'Bearer ' + 'a'.repeat(42) + '!'},
  ]) assert.equal((await me(env, headers)).authenticated, false);
});
