import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {prepareAccountBetaDataForDeletion} from '../src/account-deletion-beta-cleanup.js';
const uid='63a4cf69-678f-4788-a61d-8401cc309b72',req='b0cdd9df-5887-4e72-a1bf-31ce7482675e';
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 for(const file of ['0001_accounts.sql','0002_pro_licenses.sql','0005_account_privacy.sql',
 '0006_lemon_live_ledger.sql','0007_live_disputes.sql','0009_account_deletion_controls.sql',
 '0010_deletion_customer_confirmation.sql','9997_beta_invitations.sql',
 '9998_beta_pro_grants.sql','9999_beta_feedback.sql']){
  db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
 }
 db.prepare('INSERT INTO auth_users(id,created_at) VALUES (?,100)').run(uid);
 db.prepare("INSERT INTO auth_privacy_requests(id,user_id,kind,status,created_at) VALUES (?,?,'deletion','pending',100)").run(req,uid);
 const t=Math.floor(Date.now()/1000);
 db.prepare('INSERT INTO auth_deletion_confirmations(request_id,user_id,policy_version,confirmed_at,expires_at) VALUES (?,?,?,?,?)').run(req,uid,'approved-test-v1',t,t+600);
 db.prepare("INSERT INTO beta_reports(id,user_id,category,platform,area,summary,details,created_at,updated_at) VALUES ('report',?,'bug','macos','account','Test feedback','More than ten chars',100,100)").run(uid);
 db.prepare("INSERT INTO beta_screenshots(id,report_id,object_key,width,height,created_at) VALUES ('pic','report','private/report.png',10,10,100)").run();
 db.prepare("INSERT INTO beta_pro_grants(id,user_id,issued_at,expires_at,created_at) VALUES ('grant',?,100,200,100)").run(uid);
 db.prepare("INSERT INTO beta_invitations(id,email,created_at,expires_at,accepted_at,accepted_user_id) VALUES ('invite','a@example.invalid',1,1000,100,?)").run(uid);
 db.prepare("INSERT INTO commerce_live_orders(provider_order_id,intent_id,user_id,amount_cents,currency,status,created_at,updated_at) VALUES ('order','intent',?,100,'USD','paid',100,100)").run(uid);
 let keys=new Set(['private/report.png']),deletes=0,errors=false;
 const statement=(sql,args=[])=>({bind:(...values)=>statement(sql,values),
  first:async()=>db.prepare(sql).get(...args)||null,
  all:async()=>({results:db.prepare(sql).all(...args)}),
  run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}})
 });
 const env={AUTH_DB:{prepare:sql=>statement(sql),batch:async statements=>{
  db.exec('BEGIN IMMEDIATE');try{for(const s of statements)await s.run();db.exec('COMMIT')}
  catch(e){db.exec('ROLLBACK');throw e}
 }},BETA_SCREENSHOTS:{async delete(key){deletes++;if(errors)throw Error('R2 blocked');keys.delete(key)} }};
 return {db,env,keys,deletes:()=>deletes,setError:v=>errors=v,close:()=>db.close()};
}
const count=(db,t)=>db.prepare('SELECT COUNT(*) AS n FROM '+t).get().n;
const approval={requestId:req,policyVersion:'approved-test-v1',operatorVerified:true,
 retentionApproved:true,customerFinalConsentVerified:true};
test('beta cleanup requires verified final consent and feature flag; dry run is read-only',async()=>{
 const f=setup();try{
  assert.equal((await prepareAccountBetaDataForDeletion(f.env,uid,{})).status,'blocked');
  const dry=await prepareAccountBetaDataForDeletion(f.env,uid,approval);
  assert.equal(dry.status,'dry-run');assert.equal(dry.screenshotCount,1);
  assert.equal((await prepareAccountBetaDataForDeletion(f.env,uid,{...approval,dryRun:false})).status,'blocked');
  assert.equal(count(f.db,'beta_reports'),1);assert.equal(f.deletes(),0);
 }finally{f.close()}
});
test('beta cleanup removes linked R2 objects and D1 references but preserves purchase evidence',async()=>{
 const f=setup();try{
  f.env.ACCOUNT_DELETION_BETA_CLEANUP_ENABLED='true';
  const result=await prepareAccountBetaDataForDeletion(f.env,uid,{...approval,dryRun:false});
  assert.equal(result.status,'cleaned');
  assert.equal(f.keys.size,0);
  for(const table of ['beta_reports','beta_screenshots','beta_pro_grants','beta_invitations'])assert.equal(count(f.db,table),0);
  assert.equal(count(f.db,'auth_users'),1);
  assert.equal(count(f.db,'commerce_live_orders'),1);
  const again=await prepareAccountBetaDataForDeletion(f.env,uid,{...approval,dryRun:false});
  assert.equal(again.status,'cleaned');
 }finally{f.close()}
});
test('R2 failure blocks D1 removal; retry is safe',async()=>{
 const f=setup();try{
  f.env.ACCOUNT_DELETION_BETA_CLEANUP_ENABLED='true';
  f.setError(true);
  const denied=await prepareAccountBetaDataForDeletion(f.env,uid,{...approval,dryRun:false});
  assert.equal(denied.status,'blocked');
  assert.equal(count(f.db,'beta_reports'),1);
  assert.equal(count(f.db,'beta_screenshots'),1);
  f.setError(false);
  assert.equal((await prepareAccountBetaDataForDeletion(f.env,uid,{...approval,dryRun:false})).status,'cleaned');
 }finally{f.close()}
});
test('legal hold blocks R2 deletion as well as D1 cleanup',async()=>{
 const f=setup();try{
  f.env.ACCOUNT_DELETION_BETA_CLEANUP_ENABLED='true';
  f.db.prepare("INSERT INTO auth_deletion_holds(user_id,hold_id,reason_code,created_at) VALUES (?,'hold','legal',100)").run(uid);
  const denied=await prepareAccountBetaDataForDeletion(f.env,uid,{...approval,dryRun:false});
  assert.equal(denied.status,'blocked');
  assert.equal(f.deletes(),0);
  assert.equal(count(f.db,'beta_reports'),1);
 }finally{f.close()}
});

test('R2 cleanup deletes only the consenting account files and preserves a second customer’s files',async()=>{
 const f=setup();try{
  const control='8ee6f64e-eacf-45dd-91b8-53d126b2dc3b';
  f.db.prepare('INSERT INTO auth_users(id,created_at) VALUES (?,100)').run(control);
  f.db.prepare("INSERT INTO beta_reports(id,user_id,category,platform,area,summary,details,created_at,updated_at) VALUES ('control-report',?,'bug','macos','account','Control report','Unrelated user details',100,100)").run(control);
  f.db.prepare("INSERT INTO beta_screenshots(id,report_id,object_key,width,height,created_at) VALUES('control-pic','control-report','private/control.png',10,10,100)").run();
  f.keys.add('private/control.png');
  f.env.ACCOUNT_DELETION_BETA_CLEANUP_ENABLED='true';
  const cleaned=await prepareAccountBetaDataForDeletion(f.env,uid,{...approval,dryRun:false});
  assert.equal(cleaned.status,'cleaned');
  assert.equal(cleaned.screenshotCount,1);
  assert.equal(f.keys.has('private/report.png'),false);
  assert.equal(f.keys.has('private/control.png'),true);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM beta_reports WHERE user_id=?").get(control).n,1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM beta_screenshots WHERE report_id='control-report'").get().n,1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM beta_reports WHERE user_id=?").get(uid).n,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM auth_users WHERE id=?").get(control).n,1);
 }finally{f.close()}
});
