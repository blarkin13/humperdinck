/* Full simulated payment lifecycle on an isolated SQLite database.
 * No HTTP commerce routing, Lemon Squeezy API, Cloudflare D1, or real payments.
 * Signed production-shaped payloads are synthetic and only for local QA.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash,webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createLiveCheckoutIntent} from '../src/lemon-live-intents.js';
import {inspectSignedLiveWebhook} from '../src/lemon-live-preflight.js';
import {settleLivePaidOrder} from '../src/lemon-live-settlement.js';
import {reconcileLiveRefund} from '../src/lemon-live-refund.js';
import {reconcileVerifiedLiveDispute} from '../src/lemon-live-disputes.js';
import worker from '../src/model-proxy-worker.js';
globalThis.crypto ||= webcrypto;

const account='63a4cf69-678f-4788-a61d-8401cc309b72';
const intent1='b64bfb57-8b55-46a4-a6e6-d26c9c9781cc';
const intent2='f67be121-95e1-42c5-8876-9952513bb212';
const stranger='b71a7d52-7364-4a4f-aaad-59409e2f1128';
const start=Date.parse('2026-11-09T12:00:00Z')/1000;
const secret='local-acceptance-fixture-secret';
const asSeconds=v=>new Date(v*1000).toISOString().replace('.000Z','Z');
const tableCount=(db,name)=>db.prepare('SELECT COUNT(*) AS n FROM '+name).get().n;
const purchase=(opts={})=>{
 const {event='order_created',orderId='12345',intentId=intent1,accountId=account,
   status=event==='order_created'?'paid':'refunded',refunded=event==='order_refunded',
   paidAt=start+120,storeId=45,variantId=789,total=4900,currency='USD',
   testMode=false}=opts;
 return {meta:{event_name:event,custom_data:{account_id:accountId,intent_id:intentId}},
  data:{type:'orders',id:orderId,attributes:{
   test_mode:testMode,store_id:storeId,
   first_order_item:{test_mode:testMode,variant_id:variantId},
   status,refunded,total,currency,created_at:asSeconds(paidAt)
  }}};
};
function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('PRAGMA foreign_keys=ON');
 for(const migration of ['0001_accounts.sql','0002_pro_licenses.sql',
    '0006_lemon_live_ledger.sql','0007_live_disputes.sql']){
  sqlite.exec(readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8'));
 }
 sqlite.prepare('INSERT INTO auth_users(id,created_at) VALUES (?,?)').run(account,start-100);
 sqlite.prepare('INSERT INTO auth_users(id,created_at) VALUES (?,?)').run(stranger,start-100);
 let failAt=-1;
 const wrap=(sql,params=[])=>({
  bind(...values){return wrap(sql,values)},
  async first(){return sqlite.prepare(sql).get(...params)||null},
  async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...params).changes)}}},
  perform(){return {meta:{changes:Number(sqlite.prepare(sql).run(...params).changes)}}}
 });
 const env={
  AUTH_DB:{
   prepare:sql=>wrap(sql),
   async batch(statements){
    sqlite.exec('BEGIN IMMEDIATE');
    try{
     const results=statements.map((statement,index)=>{
      if(index===failAt)throw Error('Synthetic atomic failure');
      return statement.perform();
     });
     sqlite.exec('COMMIT');
     return results;
    }catch(error){sqlite.exec('ROLLBACK');throw error}
   }
  },
  LS_LIVE_CHECKOUT_ENABLED:true,
  LS_LIVE_STORE_ID:'45',
  LS_LIVE_VARIANT_ID:'789',
  LS_LIVE_PRICE_CENTS:4900,
  LS_LIVE_CURRENCY:'USD'
 };
 return {
  sqlite,env,
  failAt:index=>{failAt=index},
  count:name=>tableCount(sqlite,name),
  status:()=>sqlite.prepare('SELECT status FROM commerce_live_orders ORDER BY created_at LIMIT 1').get()?.status,
  license:()=>sqlite.prepare('SELECT * FROM pro_licenses').get(),
  close:()=>sqlite.close()
 };
}
async function startCheckout(f,id=intent1,at=start){
 return createLiveCheckoutIntent(f.env,{kind:'web',id:account},{
  now:at,intentId:id,ttlSeconds:1800
 });
}
async function signedOrder(data,{signatureOverride,eventHeader}={}){
 const raw=new TextEncoder().encode(JSON.stringify(data));
 const signature=signatureOverride||createHmac('sha256',secret).update(raw).digest('hex');
 return {
  order:await inspectSignedLiveWebhook({raw,signature,secret,
   storeId:'45',variantId:'789',eventHeader:eventHeader||data.meta.event_name}),
  bodySha256:createHash('sha256').update(raw).digest('hex')
 };
}
async function paid(f,config={},now=start+300){
 const {order,bodySha256}=await signedOrder(purchase(config));
 assert.ok(order,'Synthetic payment must pass signed preflight');
 return settleLivePaidOrder(f.env,order,{bodySha256,now,
  licenseId:'license-'+(config.orderId||'12345')});
}
async function refunded(f,config={},now=start+400){
 const {order,bodySha256}=await signedOrder(purchase({event:'order_refunded',...config}));
 assert.ok(order,'Synthetic refund must pass signed preflight');
 return reconcileLiveRefund(f.env,order,{bodySha256,now});
}
test('whole flow: account checkout -> signed payment -> one Pro license -> duplicate webhook',async()=>{
 const f=fixture();
 try{
  assert.equal((await startCheckout(f)).decision,'created');
  assert.equal((await paid(f)).decision,'settled');
  assert.equal(f.count('commerce_live_intents'),1);
  assert.equal(f.count('commerce_live_orders'),1);
  assert.equal(f.count('commerce_live_webhook_events'),1);
  assert.equal(f.count('pro_licenses'),1);
  assert.equal(f.license().status,'active');
  assert.equal(f.license().purchase_ref,'lslive:12345');
  assert.deepEqual(await paid(f),{decision:'already-settled',granted:false});
  assert.equal(f.count('pro_licenses'),1);
  assert.equal(f.count('commerce_live_orders'),1);
  assert.equal(f.count('commerce_live_webhook_events'),1);
 }finally{f.close()}
});
test('complete checkout then full refund: order recorded; original offline-capable grant not silently revoked',async()=>{
 const f=fixture();
 try{
  await startCheckout(f);await paid(f);
  assert.equal((await refunded(f)).decision,'recorded-for-review');
  assert.equal(f.status(),'refunded');
  assert.equal(f.license().status,'active');
  assert.equal((await refunded(f)).decision,'already-recorded');
  assert.equal(f.count('commerce_live_webhook_events'),2);
  assert.equal((await paid(f)).decision,'manual-review');
  assert.equal(f.count('pro_licenses'),1);
 }finally{f.close()}
});
test('refund-before-paid tombstone blocks late valid signed paid event',async()=>{
 const f=fixture();
 try{
  await startCheckout(f);
  assert.equal((await refunded(f)).decision,'recorded-for-review');
  assert.equal((await paid(f)).decision,'manual-review');
  assert.equal(f.status(),'refunded');
  assert.equal(f.count('pro_licenses'),0);
 }finally{f.close()}
});
test('delayed paid webhook accepted based on signed paidAt; expired and pre-creation payment refused',async()=>{
 const f=fixture();
 try{
  await startCheckout(f);
  const late=await paid(f,{paidAt:start+1799},start+86400);
  assert.equal(late.decision,'settled');
  assert.equal(f.count('pro_licenses'),1);
 }finally{f.close()}
 const g=fixture();
 try{
  await startCheckout(g);
  assert.equal((await paid(g,{paidAt:start+1801})).decision,'manual-review');
  assert.equal((await paid(g,{paidAt:start-1})).decision,'manual-review');
  assert.equal(g.count('commerce_live_orders'),0);
  assert.equal(g.count('pro_licenses'),0);
 }finally{g.close()}
});
test('forged signature, wrong store, test-mode or wrong account cannot settle',async()=>{
 const f=fixture();
 try{
  await startCheckout(f);
  for(const config of [
   {storeId:999},{variantId:1},{testMode:true},{accountId:stranger},
   {total:999},{currency:'EUR'}
  ]){
   const candidate=await signedOrder(purchase(config));
   if(!candidate.order)continue;
   assert.equal((await settleLivePaidOrder(f.env,candidate.order,{
    bodySha256:candidate.bodySha256,now:start+300,licenseId:'forged-license'
   })).decision,'manual-review');
  }
  const bad=await signedOrder(purchase(),{signatureOverride:'0'.repeat(64)});
  assert.equal(bad.order,null);
  const mismatch=await signedOrder(purchase(),{eventHeader:'order_refunded'});
  assert.equal(mismatch.order,null);
  assert.equal(f.count('commerce_live_orders'),0);
  assert.equal(f.count('pro_licenses'),0);
 }finally{f.close()}
});
test('second paid order on existing Pro preserves original grant and records separate purchase',async()=>{
 const f=fixture();
 try{
  await startCheckout(f);
  await paid(f);
  const original=f.license();
  const second=await startCheckout(f,intent2,start+400);
  assert.equal(second.decision,'created');
  assert.equal((await paid(f,{intentId:intent2,orderId:'67890',paidAt:start+450},start+500)).decision,
   'settled-existing-license');
  assert.deepEqual(f.license(),original);
  assert.equal(f.count('commerce_live_orders'),2);
  assert.equal(f.count('pro_licenses'),1);
 }finally{f.close()}
});
test('mid-transaction storage failure is retryable and does not half-issue a license',async()=>{
 const f=fixture();
 try{
  await startCheckout(f);
  f.failAt(3);
  assert.equal((await paid(f)).decision,'retryable-error');
  assert.equal(f.count('commerce_live_orders'),0);
  assert.equal(f.count('pro_licenses'),0);
  assert.equal(f.count('commerce_live_webhook_events'),0);
  f.failAt(-1);
  assert.equal((await paid(f)).decision,'settled');
  assert.equal(f.count('pro_licenses'),1);
 }finally{f.close()}
});
test('merchant-verified dispute records state without revoking original Pro or reopening failed payment',async()=>{
 const f=fixture();
 try{
  await startCheckout(f);await paid(f);
  const caseData={providerCaseId:'case_accepted_12345',orderId:'12345',status:'open',
   evidenceSource:'merchant_dashboard',evidenceReference:'merchant-case-12345',
   operatorId:'owner-operator',observedAt:start+320,verifiedByOperator:true};
  const opened=await reconcileVerifiedLiveDispute(f.env,caseData,{now:start+450});
  assert.equal(opened.decision,'recorded-for-review');
  assert.equal(f.status(),'disputed');
  assert.equal(f.license().status,'active');
  assert.equal((await paid(f)).decision,'manual-review');
  assert.equal((await refunded(f)).decision,'manual-review');
  assert.equal((await reconcileVerifiedLiveDispute(f.env,{
   ...caseData,status:'lost',observedAt:start+600
  },{now:start+650})).decision,'recorded-for-review');
  assert.equal(f.count('commerce_live_dispute_events'),2);
  assert.equal(f.license().status,'active');
 }finally{f.close()}
});
test('public Worker keeps all production commerce disabled even with populated simulated credentials',async()=>{
 const f=fixture();
 try{
  for(const path of ['/api/commerce/live/checkout','/api/commerce/live/webhook',
   '/api/commerce/live/fulfill','/api/commerce/production/checkout']){
   let access=0;
   const env={...f.env,ASSETS:{fetch(){access++;throw Error('No static fallback')}},
    LS_LIVE_FULFILLMENT_ENABLED:true,LS_LIVE_ISSUANCE_ENABLED:true,
    LS_LIVE_API_KEY:'synthetic-key',LS_LIVE_WEBHOOK_SECRET:secret};
   const response=await worker.fetch(new Request('https://humperdinck.studio'+path,
    {method:'POST',body:'{"synthetic":true}'}),env,{});
   assert.equal(response.status,503);
   assert.equal(access,0);
  }
  assert.equal(f.count('commerce_live_intents'),0);
  assert.equal(f.count('pro_licenses'),0);
 }finally{f.close()}
});
