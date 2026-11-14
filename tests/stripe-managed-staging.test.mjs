import test from 'node:test';
import assert from 'node:assert/strict';
import {stageManagedCheckout} from '../src/stripe-managed-staging-checkout.js';
import {verifyStripeWebhook,inspectStripeManagedEvent,settleStripeTestPayment} from '../src/stripe-managed-staging-webhook.js';

const uid='11111111-1111-4111-8111-111111111111';
const iid='22222222-2222-4222-8222-222222222222';
const now=1794625000;
const settings={STRIPE_STAGING_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_testfake',
 STRIPE_PRICE_ID:'price_12345678'};
const account={id:uid,kind:'web'};
const db={prepare(sql){
 return {bind(...args){return {
  async run(){return {meta:{changes:1}};},
  async first(){return null;}
 };}};
}};
function fakeApi(priceAmount=4900){
 const calls=[];
 const fetcher=async(url,opts)=>{
  calls.push({url,opts});
  return {ok:true,async json(){
   return url.includes('/prices/')?
    {active:true,livemode:false,currency:'usd',unit_amount:priceAmount,
     type:'one_time',recurring:null}:
    {id:'cs_test_valid123',url:'https://checkout.stripe.com/c/pay/cs_test_valid123',
     mode:'payment',livemode:false,managed_payments:{enabled:true}};
  }};
 };
 return {calls,fetcher};
}
test('test-mode $49.00 Managed Payments checkout is pinned and bound to account',async()=>{
 const api=fakeApi();
 const result=await stageManagedCheckout({...settings,AUTH_DB:db},account,
  {fetcher:api.fetcher,clock:()=>now,intentId:iid});
 assert.equal(result.decision,'prepared');
 assert.equal(api.calls.length,2);
 assert.match(api.calls[1].opts.body,/managed_payments%5Benabled%5D=true/);
 assert.match(api.calls[1].opts.body,/line_items%5B0%5D%5Bprice%5D=price_12345678/);
 assert.match(api.calls[1].opts.body,/mode=payment/);
 assert.match(api.calls[1].opts.body,/client_reference_id=22222222/);
 assert.equal(Number(new URLSearchParams(api.calls[1].opts.body).get('expires_at')),now+2700);

 assert.match(api.calls[1].opts.headers['Idempotency-Key'],/humperdinck-stripe-test/);
 assert.doesNotMatch(api.calls[1].opts.body,/subscription|4900|secret_key/);
});
test('rejects wrong Stripe price, missing configuration and non-web account',async()=>{
 const invalid=fakeApi(4999);
 assert.equal((await stageManagedCheckout({...settings,AUTH_DB:db},account,
  {fetcher:invalid.fetcher,clock:()=>now,intentId:iid})).decision,'blocked');
 assert.equal(invalid.calls.length,1);
 let accessed=false;
 const noCall=async()=>{accessed=true;throw Error('should not call');};
 assert.equal((await stageManagedCheckout({...settings,STRIPE_STAGING_ENABLED:'false',AUTH_DB:db},account,
  {fetcher:noCall,clock:()=>now,intentId:iid})).decision,'blocked');
 assert.equal((await stageManagedCheckout({...settings,AUTH_DB:db},{...account,kind:'desktop'},
  {fetcher:noCall,clock:()=>now,intentId:iid})).decision,'blocked');
 assert.equal(accessed,false);
});
async function signed(raw,clock=now){
 const secret='whsec_test-only-secret';
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
  {name:'HMAC',hash:'SHA-256'},false,['sign']);
 const mac=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(clock+'.'+raw));
 const hex=Buffer.from(mac).toString('hex');
 return {secret,header:'t='+clock+',v1='+hex};
}
function event(payment='paid'){
 return JSON.stringify({id:'evt_test123',type:'checkout.session.completed',livemode:false,created:now,
  data:{object:{object:'checkout.session',id:'cs_test_valid123',livemode:false,
   mode:'payment',managed_payments:{enabled:true},client_reference_id:iid,
   metadata:{intent_id:iid},amount_subtotal:4900,amount_total:4900,currency:'usd',
   payment_status:payment,payment_intent:'pi_test123'}}});
}
test('raw-body Stripe signature validates exact body and rejects stale/replayed timestamp',async()=>{
 const raw=event(),sig=await signed(raw);
 assert.equal(await verifyStripeWebhook(raw,sig.header,sig.secret,{clock:now}),true);
 assert.equal(await verifyStripeWebhook(raw+' ',sig.header,sig.secret,{clock:now}),false);
 assert.equal(await verifyStripeWebhook(raw,sig.header,sig.secret,{clock:now+301}),false);
 assert.equal(await verifyStripeWebhook(raw,'t='+now+',v1='+('0'.repeat(64)),sig.secret,{clock:now}),false);
});
test('only verified paid $49.00 test Managed Payments session can move toward settlement',async()=>{
 const raw=event(),sig=await signed(raw);
 const verified=await inspectStripeManagedEvent(raw,sig.header,sig.secret,{clock:now});
 assert.equal(verified.decision,'verified-test-payment');
 assert.equal(verified.intentId,iid);
 assert.equal(verified.sessionId,'cs_test_valid123');
 assert.equal(verified.granted,false);
 const unpaid=event('unpaid'),unpaidSig=await signed(unpaid);
 assert.equal((await inspectStripeManagedEvent(unpaid,unpaidSig.header,unpaidSig.secret,{clock:now})).decision,'ignored-unpaid');
 const bad=JSON.parse(raw);bad.data.object.amount_subtotal=4999;
 const changed=JSON.stringify(bad),signedBad=await signed(changed);
 assert.equal((await inspectStripeManagedEvent(changed,signedBad.header,signedBad.secret,{clock:now})).decision,'rejected');
 const swapped=JSON.parse(raw);swapped.data.object.managed_payments.enabled=false;
 const wrong=JSON.stringify(swapped),wrongSig=await signed(wrong);
 assert.equal((await inspectStripeManagedEvent(wrong,wrongSig.header,wrongSig.secret,{clock:now})).decision,'rejected');
});
test('settlement cannot mint Pro from an unsigned, disabled or unverified event',async()=>{
 let accesses=0;
 const noDb={prepare(){accesses++;throw Error('must not access')}};
 assert.equal((await settleStripeTestPayment({AUTH_DB:noDb,STRIPE_STAGING_ENABLED:'true'},
  {decision:'ignored-unpaid'})).decision,'rejected');
 assert.equal((await settleStripeTestPayment({AUTH_DB:noDb,STRIPE_STAGING_ENABLED:'false'},
  {decision:'verified-test-payment',eventId:'evt_test123',sessionId:'cs_test_valid123',
   intentId:iid,bodyHash:'0'.repeat(64)})).decision,'rejected');
 assert.equal(accesses,0);
});

test('isolated SQLite settlement records paid test order once and never grants ordinary buyers',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const {readFileSync}=await import('node:fs');
 const database=new DatabaseSync(':memory:');
 database.exec('PRAGMA foreign_keys=ON');
 database.exec('CREATE TABLE auth_users(id TEXT PRIMARY KEY,email TEXT)');
 database.exec('CREATE TABLE pro_licenses(id TEXT PRIMARY KEY,user_id TEXT UNIQUE REFERENCES auth_users(id),status TEXT NOT NULL,issued_at INTEGER,max_devices INTEGER,provider TEXT,purchase_ref TEXT UNIQUE)');
 database.exec(readFileSync(new URL('../migrations/0012_stripe_managed_staging.sql',import.meta.url),'utf8'));
 database.prepare('INSERT INTO auth_users(id,email) VALUES (?,?)').run(uid,'test@example.com');
 database.prepare("INSERT INTO commerce_stripe_intents(id,user_id,stripe_session_id,price_id,amount_cents,currency,mode,status,created_at,expires_at) VALUES (?,?,?,'price_12345678',4900,'USD','test','started',?,?)").run(iid,uid,'cs_test_valid123',now-30,now+1800);
 const D1={
  prepare(sql){return {bind(...args){const statement=database.prepare(sql);return {
   async first(){return statement.get(...args)||null},
   async run(){const result=statement.run(...args);return {meta:{changes:result.changes}}}
  }}}},
  async batch(statements){
   database.exec('BEGIN');
   try{
    const results=[];
    for(const statement of statements)results.push(await statement.run());
    database.exec('COMMIT');return results;
   }catch(err){database.exec('ROLLBACK');throw err}
  }
 };
 const raw=event(),sig=await signed(raw);
 const verified=await inspectStripeManagedEvent(raw,sig.header,sig.secret,{clock:now});
 const first=await settleStripeTestPayment({...settings,AUTH_DB:D1},verified,{clock:now,licenseId:'33333333-3333-4333-8333-333333333333'});
 assert.equal(first.decision,'settled-test-ledger');
 assert.equal(first.granted,false);
 assert.equal(database.prepare('SELECT COUNT(*) AS n FROM commerce_stripe_orders').get().n,1);
 assert.equal(database.prepare('SELECT COUNT(*) AS n FROM pro_licenses').get().n,0);
 assert.equal(database.prepare("SELECT status FROM commerce_stripe_intents WHERE id=?").get(iid).status,'paid');
 const second=await settleStripeTestPayment({...settings,AUTH_DB:D1},verified,{clock:now});
 assert.equal(second.decision,'already-recorded');
 assert.equal(database.prepare('SELECT COUNT(*) AS n FROM commerce_stripe_webhook_events').get().n,1);
 database.close();
});
test('explicitly allowlisted disposable test account can receive one labeled noncommercial grant',async()=>{
 const {DatabaseSync}=await import('node:sqlite');
 const {readFileSync}=await import('node:fs');
 const database=new DatabaseSync(':memory:');
 database.exec('PRAGMA foreign_keys=ON');
 database.exec('CREATE TABLE auth_users(id TEXT PRIMARY KEY,email TEXT)');
 database.exec('CREATE TABLE pro_licenses(id TEXT PRIMARY KEY,user_id TEXT UNIQUE REFERENCES auth_users(id),status TEXT NOT NULL,issued_at INTEGER,max_devices INTEGER,provider TEXT,purchase_ref TEXT UNIQUE)');
 database.exec(readFileSync(new URL('../migrations/0012_stripe_managed_staging.sql',import.meta.url),'utf8'));
 database.prepare('INSERT INTO auth_users(id,email) VALUES (?,?)').run(uid,'test@example.com');
 database.prepare("INSERT INTO commerce_stripe_intents(id,user_id,stripe_session_id,price_id,amount_cents,currency,mode,status,created_at,expires_at) VALUES (?,?,?,'price_12345678',4900,'USD','test','started',?,?)").run(iid,uid,'cs_test_valid123',now-30,now+1800);
 const D1={
  prepare(sql){return {bind(...args){const statement=database.prepare(sql);return {
   async first(){return statement.get(...args)||null},
   async run(){const result=statement.run(...args);return {meta:{changes:result.changes}}}
  }}}},
  async batch(statements){
   database.exec('BEGIN');
   try{const results=[];for(const s of statements)results.push(await s.run());database.exec('COMMIT');return results}
   catch(e){database.exec('ROLLBACK');throw e}
  }
 };
 const raw=event(),sig=await signed(raw),verified=await inspectStripeManagedEvent(raw,sig.header,sig.secret,{clock:now});
 const result=await settleStripeTestPayment({...settings,AUTH_DB:D1,STRIPE_TEST_GRANTS_ENABLED:'true',
  STRIPE_TEST_GRANT_EMAILS:'test@example.com'},verified,{clock:now,licenseId:'33333333-3333-4333-8333-333333333333'});
 assert.equal(result.decision,'settled-test-grant');
 assert.equal(result.granted,true);
 const license=database.prepare('SELECT provider,max_devices,purchase_ref FROM pro_licenses').get();
 assert.equal(license.provider,'stripe-managed-test');
 assert.equal(license.max_devices,10);
 assert.equal(license.purchase_ref,'stripe-test:cs_test_valid123');
 const again=await settleStripeTestPayment({...settings,AUTH_DB:D1,STRIPE_TEST_GRANTS_ENABLED:'true',
  STRIPE_TEST_GRANT_EMAILS:'test@example.com'},verified,{clock:now});
 assert.equal(again.decision,'already-recorded');
 assert.equal(database.prepare('SELECT COUNT(*) AS n FROM pro_licenses').get().n,1);
 database.close();
});

test('restricted Stripe test key can prepare an account-bound checkout',async()=>{
 const api=fakeApi();
 const result=await stageManagedCheckout({...settings,STRIPE_SECRET_KEY:'rk_test_limited',AUTH_DB:db},account,{fetcher:api.fetcher,clock:()=>now,intentId:iid});
 assert.equal(result.decision,'prepared');
 assert.equal(api.calls.length,2);
});

test('failed Stripe API call reports a safe phase and code without leaking raw provider messages',async()=>{
 const fetcher=async()=>({ok:false,status:403,json:async()=>({error:{
  type:'invalid_request_error',code:'permission_denied',message:'SECRET SHOULD NEVER LEAK'}})});
 const result=await stageManagedCheckout({...settings,AUTH_DB:db},account,
  {fetcher,clock:()=>now,intentId:iid});
 assert.equal(result.decision,'blocked');
 assert.match(result.reason,/price_lookup: stripe_http_403:invalid_request_error:permission_denied/);
 assert.doesNotMatch(result.reason,/SECRET/);
});
test('checkout API failure is distinct from price lookup failure',async()=>{
 const fetcher=async(url)=>{
  if(url.includes('/prices/'))return {ok:true,json:async()=>({
   active:true,livemode:false,currency:'usd',unit_amount:4900,type:'one_time',recurring:null})};
  return {ok:false,status:401,json:async()=>({error:{type:'invalid_request_error',code:'invalid_api_key'}})};
 };
 const result=await stageManagedCheckout({...settings,AUTH_DB:db},account,
  {fetcher,clock:()=>now,intentId:iid});
 assert.match(result.reason,/create_session: stripe_http_401:invalid_request_error:invalid_api_key/);
});
