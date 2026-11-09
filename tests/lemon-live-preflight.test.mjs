import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
import {inspectLiveOrder,inspectSignedLiveWebhook} from '../src/lemon-live-preflight.js';
globalThis.crypto ||= webcrypto;
const account='63a4cf69-678f-4788-a61d-8401cc309b72';
const intent='b64bfb57-8b55-46a4-a6e6-d26c9c9781cc';
const creds={storeId:'45',variantId:'789'};
const payload=(props={})=>({meta:{event_name:'order_created',custom_data:{account_id:account,intent_id:intent}},
 data:{type:'orders',id:'12345',attributes:{test_mode:false,store_id:45,
  first_order_item:{test_mode:false,variant_id:789},status:'paid',refunded:false,total:4900,currency:'USD',created_at:'2026-11-09T02:00:00Z',...props}}});
test('correct live order is verified but cannot issue an entitlement',()=>{
 const r=inspectLiveOrder(payload(),creds);
 assert.equal(r.status,'paid');
 assert.equal(r.entitlementMutationAllowed,false);
 assert.equal(r.requiresPurchaseIntentVerification,true);
});
test('test orders, forged store and variant, missing identity and pending are rejected',()=>{
 assert.equal(inspectLiveOrder(payload({test_mode:true}),creds),null);
 assert.equal(inspectLiveOrder(payload({store_id:46}),creds),null);
 assert.equal(inspectLiveOrder(payload({first_order_item:{test_mode:false,variant_id:1}}),creds),null);
 assert.equal(inspectLiveOrder(payload({status:'pending'}),creds),null);
 assert.equal(inspectLiveOrder(payload(),{}),null);
 const missing=payload();delete missing.meta.custom_data.account_id;
 assert.equal(inspectLiveOrder(missing,creds),null);
});
test('refunds explicitly require manual entitlement policy',()=>{
 const p=payload({status:'refunded',refunded:true});
 p.meta.event_name='order_refunded';
 const result=inspectLiveOrder(p,creds);
 assert.equal(result.status,'refunded');
 assert.equal(result.entitlementMutationAllowed,false);
 const invalid=payload();invalid.meta.event_name='order_refunded';
 assert.equal(inspectLiveOrder(invalid,creds),null);
});
test('authentic signed webhook accepted for inspection; altered body/header rejected',async()=>{
 const raw=new TextEncoder().encode(JSON.stringify(payload()));
 const signature=createHmac('sha256','only-for-tests').update(raw).digest('hex');
 const options={raw,signature,secret:'only-for-tests',...creds,eventHeader:'order_created'};
 assert.equal((await inspectSignedLiveWebhook(options)).orderId,'12345');
 assert.equal(await inspectSignedLiveWebhook({...options,eventHeader:'order_refunded'}),null);
 assert.equal(await inspectSignedLiveWebhook({...options,signature:'invalid'}),null);
 assert.equal(await inspectSignedLiveWebhook({...options,raw:new Uint8Array(100001)}),null);
});

test('live paid order must contain valid provider timestamp',()=>{
 assert.equal(inspectLiveOrder(payload({created_at:null}),creds),null);
 assert.equal(inspectLiveOrder(payload({created_at:'2026-11-09'}),creds),null);
 assert.equal(inspectLiveOrder(payload({created_at:'invalid'}),creds),null);
 assert.equal(inspectLiveOrder(payload(),creds).paidAtSecs,Math.floor(Date.parse('2026-11-09T02:00:00Z')/1000));
});
