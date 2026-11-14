import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleStripeSandbox} from '../src/stripe-managed-sandbox-routes.js';
import {inspectStripeTestRefund,reconcileStripeTestRefund} from '../src/stripe-managed-sandbox-refund.js';

const uid='11111111-1111-4111-8111-111111111111';
const intent='22222222-2222-4222-8222-222222222222';
const license='33333333-3333-4333-8333-333333333333';
const now=1794627489;
const secret='whsec_test_dummy_secret';
async function sign(raw){
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const mac=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(now+'.'+raw));
 return 't='+now+',v1='+Buffer.from(mac).toString('hex');
}
const raw=()=>JSON.stringify({
 id:'evt_3UbXm9IYFiMNwrqM2fU6U6Pt',type:'charge.refunded',livemode:false,created:now,
 data:{object:{id:'ch_3UbXm9IYFiMNwrqM218o4fGr',object:'charge',livemode:false,
  payment_intent:'pi_3UbXm9IYFiMNwrqM2fxWJ2SC',
  amount:5304,amount_refunded:5304,currency:'usd'}}
});
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys=ON');
 db.exec('CREATE TABLE auth_users(id TEXT PRIMARY KEY,email TEXT)');
 db.exec(readFileSync(new URL('../migrations/0002_pro_licenses.sql',import.meta.url),'utf8'));
 db.exec('BEGIN');
 db.exec(readFileSync(new URL('../migrations/0014_pro_license_repurchase.sql',import.meta.url),'utf8'));
 db.exec('COMMIT');
 db.exec(readFileSync(new URL('../migrations/0012_stripe_managed_staging.sql',import.meta.url),'utf8'));
 db.prepare("INSERT INTO auth_users(id,email) VALUES (?,?)").run(uid,'beta@example.test');
 db.prepare("INSERT INTO pro_licenses(id,user_id,status,issued_at,provider,purchase_ref) VALUES ('old-void',?,'void',?, 'lemonsqueezy-test','old-order')").run(uid,now-500);
 db.prepare("INSERT INTO pro_licenses(id,user_id,status,issued_at,provider,purchase_ref) VALUES (?,?,'active',?,'stripe-managed-test',?)")
  .run(license,uid,now-50,'stripe-test:cs_test_123abc');
 db.prepare("INSERT INTO commerce_stripe_intents(id,user_id,stripe_session_id,price_id,amount_cents,currency,mode,status,created_at,expires_at) VALUES (?,?,'cs_test_123abc','price_12345678',4900,'USD','test','paid',?,?)")
  .run(intent,uid,now-100,now+300);
 db.prepare("INSERT INTO commerce_stripe_orders(stripe_session_id,stripe_payment_intent_id,stripe_event_id,intent_id,user_id,amount_cents,currency,status,paid_at,updated_at) VALUES ('cs_test_123abc','pi_3UbXm9IYFiMNwrqM2fxWJ2SC','evt_paid',?,?,4900,'USD','paid',?,?)")
  .run(intent,uid,now-50,now-50);
 const AUTH_DB={
  prepare(sql){return {bind(...args){const s=db.prepare(sql);return {
   async first(){return s.get(...args)||null},
   async run(){return {meta:{changes:s.run(...args).changes}}}
  }}}},
  async batch(items){
   db.exec('BEGIN');
   try{const r=[];for(const x of items)r.push(await x.run());db.exec('COMMIT');return r}
   catch(e){db.exec('ROLLBACK');throw e}
  }
 };
 return {db,env:{AUTH_DB,STRIPE_STAGING_ENABLED:'true',STRIPE_WEBHOOK_SECRET:secret}};
}
test('sandbox endpoint is disabled by default even when request contains test user email',async()=>{
 let calls=0;
 const r=await handleStripeSandbox(new Request('https://humperdinck.studio/api/commerce/sandbox/checkout',{method:'POST',headers:{Origin:'https://humperdinck.studio'}}),
  {STRIPE_STAGING_ENABLED:'true',STRIPE_SECRET_KEY:'rk_test_fake',STRIPE_TEST_GRANT_EMAILS:'beta@example.test'},
  {session:async()=>{calls++;return {kind:'web',id:uid,email:'beta@example.test'}}});
 assert.equal(r.status,503);assert.equal(calls,0);
});
test('sandbox checkout refuses any unapproved web account',async()=>{
 const r=await handleStripeSandbox(new Request('https://humperdinck.studio/api/commerce/sandbox/checkout',{method:'POST',headers:{Origin:'https://humperdinck.studio'}}),
  {AUTH_DB:{},STRIPE_STAGING_ENABLED:'true',STRIPE_SANDBOX_HTTP_ENABLED:'true',
   STRIPE_SECRET_KEY:'rk_test_fake',STRIPE_TEST_GRANT_EMAILS:'other@example.test'},
  {session:async()=>({kind:'web',id:uid,email:'beta@example.test'})});
 assert.equal(r.status,403);
});
test('signed fully refunded sandbox purchase marks disposable Pro void and keeps history',async()=>{
 const {db,env}=fixture();
 const e=await inspectStripeTestRefund(raw(),await sign(raw()),env,{clock:now});
 assert.equal(e.decision,'verified-test-refund');
 assert.equal((await reconcileStripeTestRefund(env,{...e},{clock:now})).decision,'rejected');
 const result=await reconcileStripeTestRefund(env,e,{clock:now});
 assert.equal(result.decision,'recorded');
 assert.equal(result.status,'refunded');
 assert.equal(result.licenseChanged,true);
 assert.equal(db.prepare("SELECT status FROM pro_licenses WHERE id=?").get(license).status,'void');
 assert.equal(db.prepare("SELECT status FROM pro_licenses WHERE id='old-void'").get().status,'void');
 assert.equal(db.prepare('SELECT status FROM commerce_stripe_orders').get().status,'refunded');
 assert.equal((await reconcileStripeTestRefund(env,e,{clock:now})).decision,'already-recorded');
 db.close();
});
test('sandbox paid refund with registered devices records refund but retains certificate for owner review',async()=>{
 const {db,env}=fixture();
 db.prepare("INSERT INTO pro_devices(id,license_id,installation_id,label,activated_at,last_seen_at) VALUES ('device1',?,'test-installation','Test',?,?)")
  .run(license,now-20,now-20);
 const e=await inspectStripeTestRefund(raw(),await sign(raw()),env,{clock:now});
 const result=await reconcileStripeTestRefund(env,e,{clock:now});
 assert.equal(result.decision,'recorded');
 assert.equal(result.licenseChanged,false);
 assert.equal(result.requiresOfflineReview,true);
 assert.equal(db.prepare('SELECT status FROM pro_licenses WHERE id=?').get(license).status,'active');
 db.close();
});
