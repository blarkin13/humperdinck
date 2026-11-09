import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {inspectLivePaymentDelivery,processLivePaymentInStaging} from '../src/lemon-live-webhook-adapter.js';
globalThis.crypto ||= webcrypto;
const a='63a4cf69-678f-4788-a61d-8401cc309b72';
const i='b64bfb57-8b55-46a4-a6e6-d26c9c9781cc';
const secret='synthetic-only-this-is-not-a-real-webhook-secret';
const payload={meta:{event_name:'order_created',custom_data:{account_id:a,intent_id:i}},
 data:{type:'orders',id:'12345',attributes:{
  test_mode:false,store_id:45,first_order_item:{test_mode:false,variant_id:789},
  status:'paid',refunded:false,total:4900,currency:'USD',
  created_at:'2026-11-09T12:00:00Z'
 }}};
const raw=new TextEncoder().encode(JSON.stringify(payload));
const signature=createHmac('sha256',secret).update(raw).digest('hex');
const env={
 LS_LIVE_WEBHOOK_SECRET:secret,LS_LIVE_STORE_ID:'45',LS_LIVE_VARIANT_ID:'789',
 LS_LIVE_STAGING_PROCESSOR_ENABLED:true,LS_LIVE_SETTLEMENT_ENABLED:true
};
const delivery={raw,signature,eventHeader:'order_created'};
test('authenticated synthetic provider webhook yields verified order and deterministic digest',async()=>{
 const value=await inspectLivePaymentDelivery(env,delivery);
 assert.equal(value.order.orderId,'12345');
 assert.equal(value.order.entitlementMutationAllowed,false);
 assert.match(value.bodySha256,/^[a-f0-9]{64}$/);
});
test('invalid body, signature, event, store or sandbox payload is rejected before database access',async()=>{
 for(const invalid of [
  {delivery:{...delivery,signature:'0'.repeat(64)}},
  {delivery:{...delivery,eventHeader:'order_refunded'}},
  {delivery:{...delivery,raw:new Uint8Array([123,125])}},
  {config:{...env,LS_LIVE_STORE_ID:'46'}},
  {config:{...env,LS_LIVE_WEBHOOK_SECRET:''}}
 ]){
  assert.equal(await inspectLivePaymentDelivery(invalid.config||env,invalid.delivery||delivery),null);
 }
});
test('signed webhook alone cannot authorize production payment mutation',async()=>{
 for(const config of [
  {...env}, {...env,LS_LIVE_STAGING_PROCESSOR_ENABLED:false},
  {...env,LS_LIVE_SETTLEMENT_ENABLED:false},
  {...env,LS_LIVE_STAGING_PROCESSOR_ENABLED:'true'}
 ]){
  let used=0;
  const sandbox={...config,AUTH_DB:{prepare(){used++;throw Error('unreachable')}}};
  const result=await processLivePaymentInStaging(sandbox,delivery,{
   operatorReleaseApproved:false
  });
  assert.equal(result.decision,'disabled');
  assert.equal(used,0);
 }
});
test('staging handler rejects bad signatures before any ledger mutation even if approved',async()=>{
 let used=0;
 const sandbox={...env,AUTH_DB:{prepare(){used++;throw Error('unreachable')}}};
 const result=await processLivePaymentInStaging(sandbox,{
   ...delivery,signature:'x'.repeat(64)
 },{operatorReleaseApproved:true});
 assert.equal(result.decision,'rejected');
 assert.equal(used,0);
});
test('no public Worker route imports staged payment adapter',()=>{
 const worker=readFileSync(new URL('../src/model-proxy-worker.js',import.meta.url),'utf8');
 assert.doesNotMatch(worker,/lemon-live-webhook-adapter/);
 assert.match(worker,/handleUnreleasedProductionCommerce/);
});
