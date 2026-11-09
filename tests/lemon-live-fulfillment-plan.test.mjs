import test from 'node:test';
import assert from 'node:assert/strict';
import {planLiveFulfillment} from '../src/lemon-live-fulfillment-plan.js';
const user='63a4cf69-678f-4788-a61d-8401cc309b72';
const checkout='b64bfb57-8b55-46a4-a6e6-d26c9c9781cc';
const order={provider:'lemonsqueezy',orderId:'12345',event:'order_created',status:'paid',
 accountId:user,intentId:checkout,requiresPurchaseIntentVerification:true,entitlementMutationAllowed:false};
const intent={id:checkout,user_id:user,mode:'live',created_at:100,status:'started'};
const x=(patch={},context={})=>planLiveFulfillment({...order,...patch},{intent,...context});
test('new valid paid purchase can enter atomic review but never mints a license',()=>{
 const p=x();
 assert.equal(p.decision,'eligible-for-atomic-grant-review');
 assert.equal(p.mutateEntitlement,false);
 assert.match(p.requirements.join(' '),/idempoten/i);
});
test('paid events cannot cross users or mutate complimentary licenses',()=>{
 assert.equal(x({}, {intent:{...intent,user_id:'different'}}).decision,'manual-review');
 const previous={user_id:user,status:'active'};
 assert.equal(x({},{existingLicense:previous}).decision,'preserve-existing-active-license');
 assert.equal(x({},{existingLicense:{user_id:'another',status:'active'}}).decision,'manual-review');
});
test('duplicate and reversed paid/refund order require safe manual decisions',()=>{
 const current={order_id:'12345',user_id:user,intent_id:checkout,status:'paid'};
 assert.equal(x({},{existingOrder:current}).decision,'idempotent-paid-replay');
 assert.equal(x({event:'order_refunded',status:'refunded'},{existingOrder:current}).decision,'manual-review');
 assert.equal(x({event:'order_refunded',status:'refunded'}).decision,'manual-review');
 assert.equal(x({},{existingOrder:{...current,status:'refunded'}}).decision,'manual-review');
});
test('unverified event or untrusted intent is never eligible',()=>{
 assert.equal(x({entitlementMutationAllowed:true}).decision,'manual-review');
 assert.equal(x({status:'pending'}).decision,'manual-review');
 assert.equal(x({},{intent:{...intent,mode:'test'}}).decision,'manual-review');
 assert.equal(x({},{intent:{...intent,status:'cancelled'}}).decision,'manual-review');
});
