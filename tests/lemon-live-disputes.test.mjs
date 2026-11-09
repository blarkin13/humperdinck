import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {reconcileVerifiedLiveDispute} from '../src/lemon-live-disputes.js';
const user='63a4cf69-678f-4788-a61d-8401cc309b72';
const intent='b64bfb57-8b55-46a4-a6e6-d26c9c9781cc';
const caseData={providerCaseId:'case_12345',orderId:'12345',status:'open',
 evidenceSource:'merchant_dashboard',evidenceReference:'case-ref-123',
 operatorId:'owner-operator',observedAt:100,verifiedByOperator:true};
const fixture=()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 for(const path of ['0001_accounts.sql','0002_pro_licenses.sql','0006_lemon_live_ledger.sql','0007_live_disputes.sql']){
   db.exec(readFileSync(new URL('../migrations/'+path,import.meta.url),'utf8'));
 }
 db.prepare('INSERT INTO auth_users(id,created_at) VALUES (?,?)').run(user,10);
 db.prepare(`INSERT INTO commerce_live_intents(id,user_id,store_id,variant_id,amount_cents,currency,created_at,expires_at,status)
   VALUES (?,?,?,?,?,?,?,?,'paid')`).run(intent,user,'45','789',4900,'USD',20,80);
 db.prepare(`INSERT INTO commerce_live_orders
  (provider_order_id,intent_id,user_id,amount_cents,currency,status,created_at,updated_at)
  VALUES (?,?,?,?,?,'paid',?,?)`).run('12345',intent,user,4900,'USD',40,40);
 db.prepare(`INSERT INTO pro_licenses(id,user_id,status,issued_at,max_devices,provider,purchase_ref)
  VALUES (?,?,'active',?,10,?,?)`).run('pro-123',user,40,'lemonsqueezy','lslive:12345');
 const wrap=(sql,params=[])=>({bind(...values){return wrap(sql,values)},
  async first(){return db.prepare(sql).get(...params)||null},
  perform(){return {meta:{changes:Number(db.prepare(sql).run(...params).changes)}}}});
 const env={AUTH_DB:{prepare:sql=>wrap(sql),async batch(stmts){
    db.exec('BEGIN IMMEDIATE');
    try{const r=stmts.map(s=>s.perform());db.exec('COMMIT');return r}
    catch(e){db.exec('ROLLBACK');throw e}
 }}};
 const count=t=>db.prepare('SELECT COUNT(*) AS n FROM '+t).get().n;
 const getStatus=()=>db.prepare("SELECT status FROM commerce_live_orders WHERE provider_order_id='12345'").get().status;
 return {db,env,count,getStatus};
};
test('verified open dispute records evidence and never revokes lifetime license',async()=>{
 const f=fixture();
 const res=await reconcileVerifiedLiveDispute(f.env,caseData,{now:200});
 assert.equal(res.decision,'recorded-for-review');
 assert.equal(res.entitlementChanged,false);
 assert.equal(f.getStatus(),'disputed');
 assert.equal(f.count('commerce_live_disputes'),1);
 assert.equal(f.count('commerce_live_dispute_events'),1);
 assert.equal(f.db.prepare('SELECT status FROM pro_licenses').get().status,'active');
 assert.equal((await reconcileVerifiedLiveDispute(f.env,caseData,{now:201})).decision,'already-recorded');
 assert.equal(f.count('commerce_live_dispute_events'),1);
 f.db.close();
});
test('missing merchant verification, fake case and unrelated purchase are rejected',async()=>{
 const f=fixture();
 for(const bad of [{verifiedByOperator:false},{evidenceReference:'none with spaces'},
  {evidenceSource:'customer_email'},{orderId:'99999'},{status:'won'}]){
  const res=await reconcileVerifiedLiveDispute(f.env,{...caseData,...bad},{now:200});
  assert.equal(res.decision,'manual-review');
 }
 assert.equal(f.count('commerce_live_disputes'),0);
 assert.equal(f.getStatus(),'paid');
 f.db.close();
});
test('stale updates cannot reopen lost case; terminal cases remain closed',async()=>{
 const f=fixture();
 await reconcileVerifiedLiveDispute(f.env,caseData,{now:200});
 assert.equal((await reconcileVerifiedLiveDispute(f.env,{...caseData,status:'lost',observedAt:150},{now:250})).decision,'recorded-for-review');
 assert.equal(f.db.prepare('SELECT status FROM commerce_live_disputes').get().status,'lost');
 assert.equal((await reconcileVerifiedLiveDispute(f.env,{...caseData,status:'open',observedAt:120},{now:300})).decision,'stale');
 assert.equal((await reconcileVerifiedLiveDispute(f.env,{...caseData,status:'won',observedAt:175},{now:301})).decision,'manual-review');
 assert.equal(f.count('commerce_live_dispute_events'),2);
 assert.equal(f.db.prepare('SELECT status FROM pro_licenses').get().status,'active');
 f.db.close();
});
test('conflicting case order and same-timestamp updates are rejected',async()=>{
 const f=fixture();
 await reconcileVerifiedLiveDispute(f.env,caseData,{now:200});
 assert.equal((await reconcileVerifiedLiveDispute(f.env,{...caseData,orderId:'99999',observedAt:200},{now:250})).decision,'manual-review');
 assert.equal((await reconcileVerifiedLiveDispute(f.env,{...caseData,status:'won'},{now:250})).decision,'manual-review');
 assert.equal(f.count('commerce_live_dispute_events'),1);
 f.db.close();
});
test('refund already finalized remains refunded and license remains active',async()=>{
 const f=fixture();
 f.db.exec("UPDATE commerce_live_orders SET status='refunded'");
 assert.equal((await reconcileVerifiedLiveDispute(f.env,caseData,{now:200})).decision,'recorded-for-review');
 assert.equal(f.getStatus(),'refunded');
 assert.equal(f.count('pro_licenses'),1);
 f.db.close();
});
test('atomic failure reverts dispute, event and changed order status',async()=>{
 const f=fixture();
 const actual=f.env.AUTH_DB.batch;
 f.env.AUTH_DB.batch=async stmts=>{
  const original=stmts[2].perform;
  stmts[2].perform=()=>{throw Error('simulated failure')};
  try{return await actual(stmts)}finally{stmts[2].perform=original}
 };
 assert.equal((await reconcileVerifiedLiveDispute(f.env,caseData,{now:200})).decision,'retryable-error');
 assert.equal(f.getStatus(),'paid');
 assert.equal(f.count('commerce_live_disputes'),0);
 assert.equal(f.count('commerce_live_dispute_events'),0);
 f.env.AUTH_DB.batch=actual;
 assert.equal((await reconcileVerifiedLiveDispute(f.env,caseData,{now:201})).decision,'recorded-for-review');
 f.db.close();
});
