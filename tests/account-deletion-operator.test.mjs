import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {performReviewedAccountDeletion} from '../src/account-deletion-operator.js';
const u='63a4cf69-678f-4788-a61d-8401cc309b72',other='8ee6f64e-eacf-45dd-91b8-53d126b2dc3b';
const requestId='b0cdd9df-5887-4e72-a1bf-31ce7482675e';
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 for(const name of ['0001_accounts.sql','0002_pro_licenses.sql','0003_account_dashboard.sql',
  '0004_lemon_squeezy_test.sql','0005_account_privacy.sql','0006_lemon_live_ledger.sql',
  '0007_live_disputes.sql','0009_account_deletion_controls.sql',
  '9997_beta_invitations.sql','9998_beta_pro_grants.sql','9999_beta_feedback.sql']){
  db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 }
 db.prepare('INSERT INTO auth_users(id,created_at) VALUES (?,100),(?,100)').run(u,other);
 db.prepare("INSERT INTO auth_privacy_requests(id,user_id,kind,status,created_at) VALUES (?,?,'deletion','pending',100)").run(requestId,u);
 db.prepare("INSERT INTO auth_sessions(token_hash,user_id,kind,created_at,expires_at) VALUES ('session-test',?,'web',100,999)").run(u);
 db.prepare("INSERT INTO pro_licenses(id,user_id,status,issued_at,provider,purchase_ref) VALUES ('license',?,'active',100,'lemonsqueezy','lslive:12345')").run(u);
 db.prepare("INSERT INTO pro_devices(id,license_id,installation_id,label,activated_at,last_seen_at) VALUES ('device','license','installation-random','Test',100,100)").run();
 db.prepare("INSERT INTO commerce_live_intents(id,user_id,store_id,variant_id,amount_cents,currency,created_at,expires_at,status) VALUES ('intent',?,'45','789',4900,'USD',100,999,'paid')").run(u);
 db.prepare("INSERT INTO commerce_live_orders(provider_order_id,intent_id,user_id,amount_cents,currency,status,created_at,updated_at) VALUES ('order','intent',?,4900,'USD','paid',100,100)").run(u);
 db.prepare("INSERT INTO commerce_live_webhook_events(body_sha256,provider_order_id,event_name,processed_at) VALUES (?,'order','order_created',100)").run('b'.repeat(64));
 db.prepare("INSERT INTO commerce_live_disputes(provider_case_id,provider_order_id,status,evidence_source,evidence_reference,operator_id,observed_at,created_at,updated_at) VALUES ('case','order','won','merchant_dashboard','case-reference','operator',100,100,100)").run();
 const adapter={prepare(sql){
  return {bind(...args){return {sql,args,
   async first(){return db.prepare(sql).get(...args)||null},
   async run(){let r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}}}
  }}};
 },async batch(statements){
  db.exec('BEGIN IMMEDIATE');
  try{const out=[];for(const stmt of statements)out.push(await stmt.run());db.exec('COMMIT');return out}
  catch(e){db.exec('ROLLBACK');throw e}
 }};
 return {db,env:{AUTH_DB:adapter},close:()=>db.close(),count:t=>db.prepare('SELECT COUNT(*) AS n FROM '+t).get().n};
}
const approved={requestId,operatorId:'internal-reviewer',policyVersion:'deletion-draft-v1',
 operatorVerified:true,retentionApproved:true,customerFinalConsentVerified:true,
 proForfeitureAcknowledged:true,offlineCertificateAcknowledged:true,merchantRetentionVerified:true};
test('operator workflow defaults to non-destructive and requires all independent approvals',async()=>{
 const f=fixture();try{
  const noConsent=await performReviewedAccountDeletion(f.env,u,{...approved,customerFinalConsentVerified:false,dryRun:false});
  assert.equal(noConsent.deleted,false);
  const dry=await performReviewedAccountDeletion(f.env,u,approved);
  assert.equal(dry.decision,'dry-run-only');
  assert.equal(dry.onlineProWouldBeForfeited,true);
  const blocked=await performReviewedAccountDeletion(f.env,u,{...approved,dryRun:false});
  assert.equal(blocked.deleted,false);
  assert.match(blocked.reason,/disabled/);
  assert.equal(f.count('auth_users'),2);
  assert.equal(f.count('auth_deletion_audit'),0);
 }finally{f.close()}
});
test('approved operator workflow removes online account and Pro but retains merchant evidence and unrelated accounts',async()=>{
 const f=fixture();try{
  f.env.ACCOUNT_DELETION_EXECUTION_ENABLED='true';
  const result=await performReviewedAccountDeletion(f.env,u,{...approved,dryRun:false});
  assert.equal(result.decision,'deleted');
  assert.equal(f.count('auth_users'),1);
  assert.equal(f.db.prepare('SELECT id FROM auth_users').get().id,other);
  assert.equal(f.count('auth_sessions'),0);
  assert.equal(f.count('auth_privacy_requests'),0);
  assert.equal(f.count('pro_licenses'),0);
  assert.equal(f.count('pro_devices'),0);
  assert.equal(f.count('commerce_live_intents'),0);
  for(const t of ['commerce_live_orders','commerce_live_webhook_events',
   'commerce_live_disputes','auth_deletion_audit'])assert.equal(f.count(t),1,t);
  const duplicate=await performReviewedAccountDeletion(f.env,u,{...approved,dryRun:false});
  assert.equal(duplicate.deleted,false);
  assert.equal(f.count('auth_deletion_audit'),1);
 }finally{f.close()}
});
test('held, disputed, in-flight and beta-linked accounts fail closed without any deletion',async()=>{
 const scenarios=[
  f=>f.db.prepare("INSERT INTO auth_deletion_holds(user_id,hold_id,reason_code,created_at) VALUES (?,'hold','legal',100)").run(u),
  f=>f.db.prepare("UPDATE commerce_live_disputes SET status='open'").run(),
  f=>f.db.prepare("UPDATE commerce_live_intents SET status='started'").run(),
  f=>f.db.prepare("INSERT INTO beta_pro_grants(id,user_id,issued_at,expires_at,created_at) VALUES ('beta',?,100,200,100)").run(u),
  f=>f.db.prepare("INSERT INTO beta_reports(id,user_id,category,platform,area,summary,details,created_at,updated_at) VALUES ('report',?,'bug','macos','account','Account issue','Delete test details',100,100)").run(u)
 ];
 for(const arrange of scenarios){
  const f=fixture();try{
   arrange(f);
   f.env.ACCOUNT_DELETION_EXECUTION_ENABLED='true';
   const result=await performReviewedAccountDeletion(f.env,u,{...approved,dryRun:false});
   assert.equal(result.deleted,false);
   assert.equal(f.count('auth_users'),2);
   assert.equal(f.count('auth_deletion_audit'),0);
   assert.equal(f.count('commerce_live_orders'),1);
  }finally{f.close()}
 }
});
test('audit write error atomically rolls back irreversible account deletion',async()=>{
 const f=fixture();try{
  f.env.ACCOUNT_DELETION_EXECUTION_ENABLED='true';
  f.db.exec("CREATE TRIGGER block_audit BEFORE INSERT ON auth_deletion_audit BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
  const result=await performReviewedAccountDeletion(f.env,u,{...approved,dryRun:false});
  assert.equal(result.deleted,false);
  assert.equal(f.count('auth_users'),2);
  assert.equal(f.count('pro_licenses'),1);
  assert.equal(f.count('commerce_live_orders'),1);
  assert.equal(f.count('auth_deletion_audit'),0);
 }finally{f.close()}
});
test('request ID mismatch cannot destroy another user or issue an audit',async()=>{
 const f=fixture();try{
  f.env.ACCOUNT_DELETION_EXECUTION_ENABLED='true';
  const result=await performReviewedAccountDeletion(f.env,u,{
   ...approved,requestId:'d3a1b5c4-f786-40dd-9069-14de22490267',dryRun:false
  });
  assert.equal(result.deleted,false);
  assert.equal(f.count('auth_users'),2);
  assert.equal(f.count('auth_deletion_audit'),0);
 }finally{f.close()}
});
