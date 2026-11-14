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
