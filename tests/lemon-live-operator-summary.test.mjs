import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeLiveCommerceForOperator} from '../src/lemon-live-operator-summary.js';
const fake=()=>{
 let reads=0,writes=0;
 const rows={
  commerce_live_orders:[{status:'paid',count:3},{status:'refunded',count:2},{status:'partially_refunded',count:1}],
  commerce_live_disputes:[{status:'open',count:1},{status:'lost',count:1}],
  commerce_live_webhook_events:[{event_name:'order_created',count:3},{event_name:'order_refunded',count:2}]
 };
 const db={prepare(sql){
  reads++;
  const match=Object.keys(rows).find(x=>sql.includes('FROM '+x));
  if(!match)throw Error('unexpected read');
  return {async all(){return {results:rows[match]}}};
 }};
 return {env:{AUTH_DB:db,LS_LIVE_OPERATIONS_REVIEW_ENABLED:true},counters:()=>({reads,writes}),rows};
};
test('operator summary is fail-closed with no SQL reads without both gates',async()=>{
 const x=fake();
 assert.equal((await summarizeLiveCommerceForOperator(x.env)).decision,'disabled');
 assert.equal((await summarizeLiveCommerceForOperator({...x.env,LS_LIVE_OPERATIONS_REVIEW_ENABLED:false},{operatorVerified:true})).decision,'disabled');
 assert.deepEqual(x.counters(),{reads:0,writes:0});
});
test('summarizes refund/dispute review without any buyer details or SQL mutations',async()=>{
 const x=fake();
 const result=await summarizeLiveCommerceForOperator(x.env,{operatorVerified:true});
 assert.equal(result.decision,'read-only-summary');
 assert.equal(result.orders.refunded,2);
 assert.equal(result.orders.disputed,0);
 assert.equal(result.disputes.open,1);
 assert.equal(result.receipts.order_refunded,2);
 assert.equal(result.requires_policy_review,4);
 assert.equal(x.counters().reads,3);
 assert.equal(x.counters().writes,0);
 assert.doesNotMatch(JSON.stringify(result),/email|buyer|customer_id|license_id|webhook_secret/i);
});
test('unexpected provider status fails closed; absent staged tables do not claim success',async()=>{
 const x=fake();
 x.rows.commerce_live_orders=[{status:'unexpected',count:1}];
 assert.equal((await summarizeLiveCommerceForOperator(x.env,{operatorVerified:true})).decision,'unavailable');
 const noLedger={AUTH_DB:{prepare(){throw Error('Missing unapplied migrations')}},LS_LIVE_OPERATIONS_REVIEW_ENABLED:true};
 assert.equal((await summarizeLiveCommerceForOperator(noLedger,{operatorVerified:true})).decision,'unavailable');
});
