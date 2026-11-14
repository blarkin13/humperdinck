import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {inspectStripeLiveReversal,reconcileStripeLiveReversal} from '../src/stripe-managed-reversals.js';
const now=1794626500,uid='11111111-1111-4111-8111-111111111111',iid='22222222-2222-4222-8222-222222222222';
const key='whsec_stripe-reversal-test';
async function sign(raw){
 const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const h=await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(now+'.'+raw));
 return 't='+now+',v1='+Buffer.from(h).toString('hex');
}
function msg(type='charge.refunded',id='evt_refund123',overrides={}){
 const object=type.startsWith('charge.dispute.')?
 {object:'dispute',livemode:true,id:'dp_test123',payment_intent:'pi_live123',status:'needs_response'}:
 {object:'charge',livemode:true,id:'ch_test123',payment_intent:'pi_live123',amount:4900,amount_refunded:4900,currency:'usd'};
 return JSON.stringify({id,type,livemode:true,created:now,data:{object:{...object,...overrides}}});
}
function setup(){
 const sqlite=new DatabaseSync(':memory:');
 sqlite.exec('PRAGMA foreign_keys=ON');
 sqlite.exec('CREATE TABLE auth_users (id TEXT PRIMARY KEY,email TEXT)');
 sqlite.exec('CREATE TABLE pro_licenses(id TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE,status TEXT,issued_at INTEGER,max_devices INTEGER,provider TEXT,purchase_ref TEXT)');
 sqlite.exec(readFileSync(new URL('../migrations/0013_stripe_managed_live_ledger.sql',import.meta.url),'utf8'));
 sqlite.prepare('INSERT INTO auth_users(id,email) VALUES (?,?)').run(uid,'beta@example.com');
 sqlite.prepare("INSERT INTO pro_licenses(id,user_id,status,issued_at,max_devices,provider,purchase_ref) VALUES (?,?, 'active',?,10,'stripe-managed','stripe:cs_live_test123')")
  .run('33333333-3333-4333-8333-333333333333',uid,now);
 sqlite.prepare("INSERT INTO commerce_stripe_live_intents(id,user_id,stripe_session_id,price_id,amount_cents,currency,status,created_at,expires_at) VALUES (?,?,?,'price_12345678',4900,'USD','paid',?,?)")
  .run(iid,uid,'cs_live_test123',now-100,now+1800);
 sqlite.prepare("INSERT INTO commerce_stripe_live_orders(stripe_session_id,stripe_payment_intent_id,stripe_event_id,intent_id,user_id,amount_cents,currency,status,paid_at,updated_at) VALUES (?,'pi_live123','evt_paid123',?,?,4900,'USD','paid',?,?)")
  .run('cs_live_test123',iid,uid,now-50,now-50);
 const AUTH_DB={
  prepare(sql){return {bind(...args){const s=sqlite.prepare(sql);return {
   async first(){return s.get(...args)||null},
   async run(){return {meta:{changes:s.run(...args).changes}}}
  }}}},
  async batch(stmts){
   sqlite.exec('BEGIN');
   try{const rows=[];for(const s of stmts)rows.push(await s.run());sqlite.exec('COMMIT');return rows}
   catch(e){sqlite.exec('ROLLBACK');throw e}
  }
 };
 const env={AUTH_DB,STRIPE_LIVE_STAGING_ENABLED:'true',STRIPE_LIVE_WEBHOOK_SECRET:key};
 return {sqlite,env};
}
async function process(env,raw){
 const verified=await inspectStripeLiveReversal(raw,await sign(raw),env,{clock:now});
 return reconcileStripeLiveReversal(env,verified,{clock:now});
}
test('unsigned reversal cannot alter purchase or license',async()=>{
 const {sqlite,env}=setup(),raw=msg();
 const result=await inspectStripeLiveReversal(raw,'t='+now+',v1='+('0'.repeat(64)),env,{clock:now});
 assert.equal(result.decision,'rejected');
 assert.equal((await reconcileStripeLiveReversal(env,result,{clock:now})).decision,'rejected');
 assert.equal(sqlite.prepare('SELECT status FROM commerce_stripe_live_orders').get().status,'paid');
 sqlite.close();
});
test('signed full refund voids only online Pro; offline certificate cannot be remotely erased',async()=>{
 const {sqlite,env}=setup(),raw=msg();
 const first=await process(env,raw);
 assert.equal(first.decision,'recorded-for-review');
 assert.equal(first.entitlementChanged,true);
 assert.equal(sqlite.prepare('SELECT status FROM commerce_stripe_live_orders').get().status,'refunded');
 assert.equal(sqlite.prepare('SELECT status FROM pro_licenses').get().status,'void');
 assert.equal((await process(env,raw)).decision,'already-recorded');
 sqlite.close();
});
test('partial refund cannot overwrite full refund and dispute cannot be downgraded',async()=>{
 const {sqlite,env}=setup();
 assert.equal((await process(env,msg('charge.refunded','evt_full123'))).decision,'recorded-for-review');
 assert.equal((await process(env,msg('charge.refunded','evt_part123',{amount_refunded:1000}))).decision,'recorded-for-review');
 assert.equal(sqlite.prepare('SELECT status FROM commerce_stripe_live_orders').get().status,'refunded');
 assert.equal((await process(env,msg('charge.dispute.created','evt_dispute123'))).decision,'recorded-for-review');
 assert.equal(sqlite.prepare('SELECT status FROM commerce_stripe_live_orders').get().status,'refunded');
 sqlite.close();
 const other=setup();
 assert.equal((await process(other.env,msg('charge.dispute.created','evt_dispute124'))).decision,'recorded-for-review');
 assert.equal((await process(other.env,msg('charge.refunded','evt_refund124',{amount_refunded:1000}))).decision,'recorded-for-review');
 assert.equal(other.sqlite.prepare('SELECT status FROM commerce_stripe_live_orders').get().status,'disputed');
 other.sqlite.close();
});
test('unmatched Stripe payment intent triggers review with no ledger changes',async()=>{
 const {sqlite,env}=setup();
 const raw=msg('charge.refunded','evt_unmatched123',{payment_intent:'pi_other123'});
 const r=await process(env,raw);
 assert.equal(r.decision,'review');
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM commerce_stripe_live_events').get().n,0);
 sqlite.close();
});
test('no forged event object can be submitted to reconciliation',async()=>{
 const {sqlite,env}=setup(),raw=msg();
 const verified=await inspectStripeLiveReversal(raw,await sign(raw),env,{clock:now});
 assert.equal((await reconcileStripeLiveReversal(env,{...verified},{clock:now})).decision,'rejected');
 assert.equal(sqlite.prepare('SELECT status FROM commerce_stripe_live_orders').get().status,'paid');
 sqlite.close();
});

test('partial refund leaves active Pro; signed dispute blocks future online Pro activation',async()=>{
 const partial=setup();
 const a=await process(partial.env,msg('charge.refunded','evt_partial_only',{amount_refunded:1000}));
 assert.equal(a.entitlementChanged,false);
 assert.equal(partial.sqlite.prepare('SELECT status FROM pro_licenses').get().status,'active');
 partial.sqlite.close();
 const disputed=setup();
 const b=await process(disputed.env,msg('charge.dispute.created','evt_dispute_full'));
 assert.equal(b.entitlementChanged,true);
 assert.equal(disputed.sqlite.prepare('SELECT status FROM pro_licenses').get().status,'void');
 assert.equal(disputed.sqlite.prepare('SELECT status FROM commerce_stripe_live_orders').get().status,'disputed');
 assert.equal((await process(disputed.env,msg('charge.dispute.closed','evt_dispute_closed'))).decision,'recorded-for-review');
 assert.equal(disputed.sqlite.prepare('SELECT status FROM pro_licenses').get().status,'void');
 disputed.sqlite.close();
});
