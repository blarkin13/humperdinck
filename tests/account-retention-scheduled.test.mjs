import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {runScheduledAuthRetention} from '../src/account-retention-scheduled.js';
const DAY=86400,clock=2_000_000_000;
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 for(const migration of ['0001_accounts.sql','0002_pro_licenses.sql','0003_account_dashboard.sql',
  '0005_account_privacy.sql','0006_lemon_live_ledger.sql','0007_live_disputes.sql',
  '0009_account_deletion_controls.sql','0010_deletion_customer_confirmation.sql']){
  db.exec(readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8'));
 }
 const u='63a4cf69-678f-4788-a61d-8401cc309b72',requestId='b0cdd9df-5887-4e72-a1bf-31ce7482675e';
 db.prepare('INSERT INTO auth_users(id,created_at) VALUES (?,1)').run(u);
 db.prepare("INSERT INTO pro_licenses(id,user_id,status,issued_at) VALUES ('pro',?,'active',1)").run(u);
 db.prepare("INSERT INTO auth_privacy_requests(id,user_id,kind,status,created_at) VALUES (?,?,'deletion','pending',1)").run(requestId,u);
 db.prepare('INSERT INTO auth_deletion_confirmations (request_id,user_id,policy_version,confirmed_at,expires_at) VALUES (?,? ,?, ?,?)')
  .run(requestId,u,'policy',clock-2*DAY-600,clock-2*DAY);
 for(const [token,expire] of [['old',clock-8*DAY],['recent',clock-6*DAY]]){
  db.prepare("INSERT INTO auth_sessions(token_hash,user_id,kind,created_at,expires_at) VALUES (?,?,'web',?,?)").run(token,u,expire-DAY,expire);
 }
 db.prepare("INSERT INTO auth_flows(state_hash,provider,nonce,verifier,return_path,expires_at) VALUES ('old','google','n','v','/account/',?)").run(clock-2*DAY);
 db.prepare("INSERT INTO auth_flows(state_hash,provider,nonce,verifier,return_path,expires_at) VALUES ('recent','google','n','v','/account/',?)").run(clock-300);
 db.prepare("INSERT INTO auth_rate(bucket,created_at) VALUES ('old',?),('recent',?)").run(clock-9*DAY,clock-DAY);
 db.prepare("INSERT INTO commerce_live_orders(provider_order_id,intent_id,user_id,amount_cents,currency,status,created_at,updated_at) VALUES ('order','intent',?,100,'USD','paid',1,1)").run(u);
 let writes=0;
 const env={AUTH_DB:{prepare(sql){return {bind(...args){return {async run(){writes++;let r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}}}}}}}}};
 return {db,env,stats:()=>writes};
}
const count=(db,t)=>db.prepare('SELECT COUNT(*) AS n FROM '+t).get().n;
test('scheduled retention defaults off and cannot mutate without execution permission',async()=>{
 const x=setup();try{
  const disabled=await runScheduledAuthRetention(x.env,{execute:true,clock});
  assert.equal(disabled.status,'disabled');
  x.env.ACCOUNT_RETENTION_CLEANUP_ENABLED='true';
  const dry=await runScheduledAuthRetention(x.env,{execute:false,clock});
  assert.equal(dry.status,'disabled');
  assert.equal(x.stats(),0);
  assert.equal(count(x.db,'auth_sessions'),2);
  assert.equal(count(x.db,'commerce_live_orders'),1);
 }finally{x.db.close()}
});
test('scheduled retention removes only expired short-lived records; preserves accounts and commerce',async()=>{
 const x=setup();try{
  x.env.ACCOUNT_RETENTION_CLEANUP_ENABLED='true';
  const r=await runScheduledAuthRetention(x.env,{execute:true,clock});
  assert.equal(r.status,'complete');
  assert.equal(r.changes.sessions,1);
  assert.equal(r.changes.oauth,1);
  assert.equal(r.changes.rate_limits,1);
  assert.equal(r.changes.deletion_confirmations,1);
  assert.equal(count(x.db,'auth_sessions'),1);
  assert.equal(count(x.db,'auth_flows'),1);
  assert.equal(count(x.db,'auth_rate'),1);
  assert.equal(count(x.db,'auth_deletion_confirmations'),0);
  assert.equal(count(x.db,'auth_users'),1);
  assert.equal(count(x.db,'pro_licenses'),1);
  assert.equal(count(x.db,'auth_privacy_requests'),1);
  assert.equal(count(x.db,'commerce_live_orders'),1);
 }finally{x.db.close()}
});
