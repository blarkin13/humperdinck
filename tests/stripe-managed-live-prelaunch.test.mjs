import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {prepareStripeLiveCheckout,inspectStripeLiveWebhook,settleStripeLivePayment} from '../src/stripe-managed-live-prelaunch.js';

const userId='11111111-1111-4111-8111-111111111111';
const intentId='22222222-2222-4222-8222-222222222222';
const licenseId='33333333-3333-4333-8333-333333333333';
const now=1794625000;
const opts={STRIPE_LIVE_STAGING_ENABLED:'true',STRIPE_LIVE_SECRET_KEY:'sk_live_testfake',
 STRIPE_LIVE_PRICE_ID:'price_12345678',STRIPE_LIVE_PRODUCT_ID:'prod_12345678'};
function db(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('PRAGMA foreign_keys=ON');
 sqlite.exec('CREATE TABLE auth_users(id TEXT PRIMARY KEY,email TEXT)');
 sqlite.exec('CREATE TABLE pro_licenses(id TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE REFERENCES auth_users(id),status TEXT,issued_at INTEGER,max_devices INTEGER,provider TEXT,purchase_ref TEXT UNIQUE)');
 sqlite.exec(readFileSync(new URL('../migrations/0013_stripe_managed_live_ledger.sql',import.meta.url),'utf8'));
 sqlite.prepare('INSERT INTO auth_users(id,email) VALUES (?,?)').run(userId,'owner@example.test');
 return {
  sqlite,AUTH_DB:{
   prepare(sql){return {bind(...args){const s=sqlite.prepare(sql);return {
    async first(){return s.get(...args)||null},
    async run(){return {meta:{changes:s.run(...args).changes}}}
   }}}},
   async batch(statements){
    sqlite.exec('BEGIN');
    try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results}
    catch(e){sqlite.exec('ROLLBACK');throw e}
   }
  }
 };
}
function mockFetch({price=4900,product='prod_12345678',enabled=true}={}){
 const requests=[];
 return {requests,fetcher:async(url,params)=>{
  requests.push({url,params});
  return {ok:true,async json(){
   return url.includes('/prices/')?{
    active:true,type:'one_time',recurring:null,livemode:true,currency:'usd',
    product,unit_amount:price
   }:{
    id:'cs_live_abcdef123',url:'https://checkout.stripe.com/c/pay/cs_live_abcdef123',
    livemode:true,mode:'payment',managed_payments:{enabled}
   };
  }};
 }};
}
async function signed(raw){
 const secret='whsec_live-signing-test';
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const hash=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(now+'.'+raw));
 return {secret,header:'t='+now+',v1='+Buffer.from(hash).toString('hex')};
}
const payment=()=>JSON.stringify({id:'evt_live123',livemode:true,
 type:'checkout.session.completed',created:now,
 data:{object:{object:'checkout.session',id:'cs_live_abcdef123',livemode:true,
 mode:'payment',managed_payments:{enabled:true},client_reference_id:intentId,
 metadata:{intent_id:intentId},currency:'usd',amount_subtotal:4900,amount_total:4900,
 payment_status:'paid',payment_intent:'pi_live123'}}});
test('real $49 one-time Managed Payments checkout is pinned to Stripe product and account',async()=>{
 const database=db(),api=mockFetch();
 const r=await prepareStripeLiveCheckout({...opts,AUTH_DB:database.AUTH_DB},
  {id:userId,kind:'web'},{fetcher:api.fetcher,clock:()=>now,intentId});
 assert.equal(r.decision,'prepared-live-session');
 assert.equal(api.requests.length,2);
 assert.match(api.requests[1].params.body,/managed_payments%5Benabled%5D=true/);
 assert.match(api.requests[1].params.body,/mode=payment/);
 assert.match(api.requests[1].params.body,/line_items%5B0%5D%5Bprice%5D=price_12345678/);
 assert.equal(Number(new URLSearchParams(api.requests[1].params.body).get('expires_at')),now+2700);

 assert.equal(database.sqlite.prepare('SELECT stripe_session_id FROM commerce_stripe_live_intents').get().stripe_session_id,'cs_live_abcdef123');
 database.sqlite.close();
});
test('wrong price, product, account or missing live release staging flag cannot charge',async()=>{
 const database=db(),bad=mockFetch({price:4999});
 assert.equal((await prepareStripeLiveCheckout({...opts,AUTH_DB:database.AUTH_DB},
  {id:userId,kind:'web'},{fetcher:bad.fetcher,clock:()=>now,intentId})).decision,'blocked');
 assert.equal(bad.requests.length,1);
 const other=mockFetch({product:'prod_other123'});
 assert.equal((await prepareStripeLiveCheckout({...opts,AUTH_DB:database.AUTH_DB},
  {id:userId,kind:'web'},{fetcher:other.fetcher,clock:()=>now,intentId})).decision,'blocked');
 let called=false;const noFetch=async()=>{called=true;throw Error('never');};
 assert.equal((await prepareStripeLiveCheckout({...opts,STRIPE_LIVE_STAGING_ENABLED:'false',AUTH_DB:database.AUTH_DB},
  {id:userId,kind:'web'},{fetcher:noFetch,clock:()=>now,intentId})).decision,'blocked');
 assert.equal((await prepareStripeLiveCheckout({...opts,AUTH_DB:database.AUTH_DB},
  {id:userId,kind:'desktop'},{fetcher:noFetch,clock:()=>now,intentId})).decision,'blocked');
 assert.equal(called,false);
 database.sqlite.close();
});
test('only signed, paid, live Managed Payments $49 events qualify',async()=>{
 const raw=payment(),sig=await signed(raw);
 const v=await inspectStripeLiveWebhook(raw,sig.header,
  {STRIPE_LIVE_WEBHOOK_SECRET:sig.secret},{clock:now});
 assert.equal(v.decision,'verified-live-payment');
 assert.equal(v.sessionId,'cs_live_abcdef123');
 assert.equal((await inspectStripeLiveWebhook(raw+' ',
  sig.header,{STRIPE_LIVE_WEBHOOK_SECRET:sig.secret},{clock:now})).decision,'blocked');
 const wrong=JSON.parse(raw);wrong.data.object.amount_subtotal=4999;
 const changed=JSON.stringify(wrong),badSig=await signed(changed);
 assert.equal((await inspectStripeLiveWebhook(changed,badSig.header,
  {STRIPE_LIVE_WEBHOOK_SECRET:badSig.secret},{clock:now})).decision,'blocked');
 const unpaid=JSON.parse(raw);unpaid.data.object.payment_status='unpaid';
 const notPaid=JSON.stringify(unpaid),notPaidSig=await signed(notPaid);
 assert.equal((await inspectStripeLiveWebhook(notPaid,notPaidSig.header,
  {STRIPE_LIVE_WEBHOOK_SECRET:notPaidSig.secret},{clock:now})).decision,'unpaid');
});
test('isolated live settlement grants Pro once with 10 devices and preserves merchant records',async()=>{
 const database=db();
 database.sqlite.prepare("INSERT INTO commerce_stripe_live_intents(id,user_id,stripe_session_id,price_id,amount_cents,currency,status,created_at,expires_at) VALUES (?,?,?,'price_12345678',4900,'USD','started',?,?)")
 .run(intentId,userId,'cs_live_abcdef123',now-30,now+1800);
 const raw=payment(),sig=await signed(raw);
 const verified=await inspectStripeLiveWebhook(raw,sig.header,{STRIPE_LIVE_WEBHOOK_SECRET:sig.secret},{clock:now});
 const env={...opts,AUTH_DB:database.AUTH_DB};
 const forged=await settleStripeLivePayment(env,{...verified},{clock:now,licenseId});
 assert.equal(forged.decision,'blocked');
 assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS count FROM pro_licenses').get().count,0);
 const first=await settleStripeLivePayment(env,verified,{clock:now,licenseId});
 assert.equal(first.decision,'settled-live-Pro');
 assert.equal(first.granted,true);
 const purchased=database.sqlite.prepare('SELECT provider,max_devices,purchase_ref FROM pro_licenses').get();
 assert.equal(purchased.provider,'stripe-managed');
 assert.equal(purchased.max_devices,10);
 assert.equal(purchased.purchase_ref,'stripe:cs_live_abcdef123');
 assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS count FROM commerce_stripe_live_orders').get().count,1);
 const second=await settleStripeLivePayment(env,verified,{clock:now});
 assert.equal(second.decision,'already-settled');
 assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS count FROM pro_licenses').get().count,1);
 database.sqlite.close();
});
test('unverified event, wrong account intent and disabled configuration cannot mint Pro',async()=>{
 const database=db();
 database.sqlite.prepare("INSERT INTO commerce_stripe_live_intents(id,user_id,stripe_session_id,price_id,amount_cents,currency,status,created_at,expires_at) VALUES (?,?,?,'price_12345678',4900,'USD','started',?,?)")
 .run(intentId,userId,'cs_live_abcdef123',now-30,now+1800);
 const raw=payment(),sig=await signed(raw);
 const verified=await inspectStripeLiveWebhook(raw,sig.header,{STRIPE_LIVE_WEBHOOK_SECRET:sig.secret},{clock:now});
 const wrong={...verified,intentId:'44444444-4444-4444-8444-444444444444'};
 assert.equal((await settleStripeLivePayment({...opts,AUTH_DB:database.AUTH_DB},wrong,{clock:now})).decision,'blocked');
 assert.equal((await settleStripeLivePayment({...opts,STRIPE_LIVE_STAGING_ENABLED:'false',AUTH_DB:database.AUTH_DB},verified,{clock:now})).decision,'blocked');
 assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS count FROM pro_licenses').get().count,0);
 database.sqlite.close();
});

test('restricted live key works with an owner-configured price and product',async()=>{
 const database=db(),api=mockFetch();
 const result=await prepareStripeLiveCheckout({...opts,STRIPE_LIVE_SECRET_KEY:'rk_live_scoped',AUTH_DB:database.AUTH_DB},{id:userId,kind:'web'},{fetcher:api.fetcher,clock:()=>now,intentId});
 assert.equal(result.decision,'prepared-live-session');
 database.sqlite.close();
});
