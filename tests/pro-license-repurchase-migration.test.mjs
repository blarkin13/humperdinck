import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

const schema=readFileSync(new URL('../migrations/0002_pro_licenses.sql',import.meta.url),'utf8');
const migration=readFileSync(new URL('../migrations/0014_pro_license_repurchase.sql',import.meta.url),'utf8');
const user='11111111-1111-4111-8111-111111111111';
const voidId='22222222-2222-4222-8222-222222222222';
const liveId='33333333-3333-4333-8333-333333333333';
const deviceId='44444444-4444-4444-8444-444444444444';

test('void history and registered device survive schema rebuild; one new active license allowed',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON;CREATE TABLE auth_users(id TEXT PRIMARY KEY);');
 db.exec(schema);
 db.prepare('INSERT INTO auth_users(id) VALUES (?)').run(user);
 db.prepare("INSERT INTO pro_licenses(id,user_id,status,issued_at,provider,purchase_ref) VALUES (?,?,'void',1000,'lemonsqueezy-test','ls-old')")
   .run(voidId,user);
 db.prepare("INSERT INTO pro_devices(id,license_id,installation_id,label,activated_at,last_seen_at,deactivated_at) VALUES (?,?,?,'old device',1000,1000,NULL)")
   .run(deviceId,voidId,'installation-test');
 db.exec('BEGIN');
 db.exec(migration);
 db.exec('COMMIT');
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(db.prepare('SELECT id FROM pro_devices WHERE license_id=?').get(voidId).id,deviceId);
 assert.equal(db.prepare('SELECT status FROM pro_licenses WHERE id=?').get(voidId).status,'void');
 db.prepare("INSERT INTO pro_licenses(id,user_id,status,issued_at,provider,purchase_ref) VALUES (?,?,'active',1100,'stripe-managed','stripe-new')")
   .run(liveId,user);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pro_licenses WHERE user_id=?").get(user).n,2);
 assert.equal(db.prepare("SELECT id FROM pro_licenses WHERE user_id=? AND status='active'").get(user).id,liveId);
 assert.throws(()=>db.prepare("INSERT INTO pro_licenses(id,user_id,status,issued_at) VALUES ('another',?,'active',1200)").run(user));
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 db.close();
});

test('migration keeps active licenses, device constraints and purchase reference uniqueness',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON;CREATE TABLE auth_users(id TEXT PRIMARY KEY);');
 db.exec(schema);
 db.prepare('INSERT INTO auth_users(id) VALUES (?)').run(user);
 db.prepare("INSERT INTO pro_licenses(id,user_id,status,issued_at,max_devices,provider,purchase_ref) VALUES (?,?,'active',1000,10,'lemonsqueezy','purchase-123')")
   .run(liveId,user);
 db.exec('BEGIN');db.exec(migration);db.exec('COMMIT');
 assert.equal(db.prepare("SELECT max_devices FROM pro_licenses WHERE id=?").get(liveId).max_devices,10);
 assert.throws(()=>db.prepare("INSERT INTO pro_licenses(id,user_id,status,issued_at,purchase_ref) VALUES ('new',?,'void',1100,'purchase-123')").run(user));
 assert.throws(()=>db.prepare("INSERT INTO pro_devices(id,license_id,installation_id,label,activated_at,last_seen_at) VALUES ('broken','not-found','inst','x',1,1)").run());
 db.close();
});
