/* Cloud D1 release readiness: isolated SQLite schema constraints and atomic
 * rollback. Does not execute migrations against production D1.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const user='12345678-1234-4234-8234-111111111111';
const intent='12345678-1234-4234-8234-222222222222';
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 for(const name of ['0001_accounts.sql','0002_pro_licenses.sql',
   '0006_lemon_live_ledger.sql','0007_live_disputes.sql'])
  db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 db.prepare('INSERT INTO auth_users(id,created_at) VALUES (?,?)').run(user,1);
 db.prepare("INSERT INTO commerce_live_intents(id,user_id,store_id,variant_id,amount_cents,currency,created_at,expires_at,status) VALUES (?,?,'45','789',4900,'USD',100,200,'started')").run(intent,user);
 return db;
}
const n=(db,t)=>db.prepare('SELECT COUNT(*) AS n FROM '+t).get().n;
test('live D1 migration schema rejects duplicate grant, intent, order and event identities',()=>{
 const db=setup();
 try{
  db.prepare("INSERT INTO pro_licenses(id,user_id,status,issued_at) VALUES ('p1',?,'active',150)").run(user);
  assert.throws(()=>db.prepare("INSERT INTO pro_licenses(id,user_id,status,issued_at) VALUES ('p2',?,'active',151)").run(user));
  db.prepare("INSERT INTO commerce_live_orders(provider_order_id,intent_id,user_id,amount_cents,currency,status,created_at,updated_at) VALUES ('order1',?, ?,4900,'USD','paid',150,150)").run(intent,user);
  assert.throws(()=>db.prepare("INSERT INTO commerce_live_orders(provider_order_id,intent_id,user_id,amount_cents,currency,status,created_at,updated_at) VALUES ('order2',?, ?,4900,'USD','paid',150,150)").run(intent,user));
  assert.throws(()=>db.prepare("INSERT INTO commerce_live_orders(provider_order_id,intent_id,user_id,amount_cents,currency,status,created_at,updated_at) VALUES ('order1','another', ?,4900,'USD','paid',150,150)").run(user));
  db.prepare("INSERT INTO commerce_live_webhook_events(body_sha256,provider_order_id,event_name,processed_at) VALUES (?,'order1','order_created',150)").run('a'.repeat(64));
  assert.throws(()=>db.prepare("INSERT INTO commerce_live_webhook_events(body_sha256,provider_order_id,event_name,processed_at) VALUES (?,'order1','order_created',151)").run('a'.repeat(64)));
  assert.equal(n(db,'pro_licenses'),1);
  assert.equal(n(db,'commerce_live_orders'),1);
  assert.equal(n(db,'commerce_live_webhook_events'),1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close()}
});
test('failed dispute reference and invalid statuses leave all payment tables untouched',()=>{
 const db=setup();
 try{
  assert.throws(()=>db.prepare("INSERT INTO commerce_live_disputes(provider_case_id,provider_order_id,status,evidence_source,evidence_reference,operator_id,observed_at,created_at,updated_at) VALUES ('case','unknown','open','merchant_dashboard','case-ref','operator',1,1,1)").run());
  assert.throws(()=>db.prepare("INSERT INTO commerce_live_orders(provider_order_id,intent_id,user_id,amount_cents,currency,status,created_at,updated_at) VALUES ('order1',?, ?,-1,'USD','paid',150,150)").run(intent,user));
  assert.equal(n(db,'commerce_live_disputes'),0);
  assert.equal(n(db,'commerce_live_orders'),0);
 }finally{db.close()}
});
test('simulated partially committed payment and grant are undone after SQLite crash',()=>{
 const db=setup();
 try{
  db.exec('BEGIN IMMEDIATE');
  try{
   db.prepare("INSERT INTO commerce_live_orders(provider_order_id,intent_id,user_id,amount_cents,currency,status,created_at,updated_at) VALUES ('order1',?,?,4900,'USD','paid',150,150)").run(intent,user);
   db.prepare("INSERT INTO pro_licenses(id,user_id,status,issued_at) VALUES ('p1',?,'active',150)").run(user);
   // Force duplicate event receipt error after the grant was added.
   db.prepare("INSERT INTO commerce_live_webhook_events(body_sha256,provider_order_id,event_name,processed_at) VALUES (?,'order1','order_created',150)").run('a'.repeat(64));
   db.prepare("INSERT INTO commerce_live_webhook_events(body_sha256,provider_order_id,event_name,processed_at) VALUES (?,'order1','order_created',151)").run('a'.repeat(64));
   assert.fail('collision should have failed');
  }catch{
   db.exec('ROLLBACK');
  }
  assert.equal(n(db,'commerce_live_orders'),0);
  assert.equal(n(db,'pro_licenses'),0);
  assert.equal(n(db,'commerce_live_webhook_events'),0);
  assert.equal(db.prepare('SELECT status FROM commerce_live_intents').get().status,'started');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close()}
});
