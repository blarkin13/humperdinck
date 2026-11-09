/* Schema-only account deletion safety acceptance.
 * Never deletes production accounts; no deletion API exists.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const user='63a4cf69-678f-4788-a61d-8401cc309b72';
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 for(const file of ['0001_accounts.sql','0002_pro_licenses.sql',
  '0006_lemon_live_ledger.sql','0007_live_disputes.sql']){
  db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 }
 db.prepare('INSERT INTO auth_users(id,created_at) VALUES (?,?)').run(user,100);
 db.prepare("INSERT INTO auth_sessions(token_hash,user_id,kind,created_at,expires_at) VALUES (?,?,'web',100,999)").run('session-test',user);
 db.prepare("INSERT INTO pro_licenses(id,user_id,status,issued_at,provider,purchase_ref) VALUES (?,?,'active',100,'lemonsqueezy','lslive:12345')").run('license-test',user);
 db.prepare("INSERT INTO pro_devices(id,license_id,installation_id,label,activated_at,last_seen_at) VALUES (?,?,'random-install','Test laptop',100,100)").run('device-test','license-test');
 db.prepare("INSERT INTO commerce_live_intents(id,user_id,store_id,variant_id,amount_cents,currency,created_at,expires_at,status) VALUES (?,?,'45','789',4900,'USD',100,1000,'paid')").run('b64bfb57-8b55-46a4-a6e6-d26c9c9781cc',user);
 db.prepare("INSERT INTO commerce_live_orders(provider_order_id,intent_id,user_id,amount_cents,currency,status,created_at,updated_at) VALUES ('12345',?,?,4900,'USD','refunded',100,200)").run('b64bfb57-8b55-46a4-a6e6-d26c9c9781cc',user);
 db.prepare("INSERT INTO commerce_live_webhook_events(body_sha256,provider_order_id,event_name,processed_at) VALUES (?,'12345','order_refunded',200)").run('a'.repeat(64));
 db.prepare("INSERT INTO commerce_live_disputes(provider_case_id,provider_order_id,status,evidence_source,evidence_reference,operator_id,observed_at,created_at,updated_at) VALUES ('case1','12345','open','merchant_dashboard','case-reference','operator',150,150,150)").run();
 return db;
}
test('simulated deliberate deletion cascades authentication and online licenses but retains minimal payment evidence',()=>{
 const db=fixture();
 try{
  db.prepare('DELETE FROM auth_users WHERE id=?').run(user);
  const count=t=>db.prepare('SELECT COUNT(*) AS n FROM '+t).get().n;
  for(const table of ['auth_users','auth_sessions','pro_licenses','pro_devices','commerce_live_intents'])
   assert.equal(count(table),0,table);
  assert.equal(count('commerce_live_orders'),1);
  assert.equal(count('commerce_live_webhook_events'),1);
  assert.equal(count('commerce_live_disputes'),1);
  assert.equal(db.prepare('SELECT status FROM commerce_live_orders').get().status,'refunded');
  assert.equal(db.prepare('SELECT purchase_ref FROM pro_licenses').get(),undefined);
 }finally{db.close()}
});
test('failed or rolled-back deletion never removes any online entitlements or purchase evidence',()=>{
 const db=fixture();
 try{
  db.exec('BEGIN IMMEDIATE');
  db.prepare('DELETE FROM auth_users WHERE id=?').run(user);
  db.exec('ROLLBACK');
  for(const table of ['auth_users','pro_licenses','pro_devices','commerce_live_orders','commerce_live_webhook_events'])
   assert.equal(db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n,1,table);
 }finally{db.close()}
});
