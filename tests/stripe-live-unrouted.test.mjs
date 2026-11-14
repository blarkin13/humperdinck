import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/model-proxy-worker.js';
import {handleStripeLiveUnrouted} from '../src/stripe-managed-live-routes-unrouted.js';

const origin='https://humperdinck.studio';
const user={id:'11111111-1111-4111-8111-111111111111',kind:'web',email:'test@example.com'};

test('production Stripe routes fail closed when live HTTP release flag is disabled',async()=>{
 const env={STRIPE_LIVE_HTTP_ENABLED:'false',STRIPE_LIVE_STAGING_ENABLED:'true',
  STRIPE_LIVE_SECRET_KEY:'rk_live_testfake',STRIPE_LIVE_WEBHOOK_SECRET:'whsec_dummy',
  STRIPE_LIVE_PRICE_ID:'price_12345678',STRIPE_LIVE_PRODUCT_ID:'prod_12345678',
  AUTH_DB:{prepare(){throw new Error('must not hit D1')}},ASSETS:{fetch(){throw new Error('must not serve static')}},AUTH_RATE_SECRET:'test'};
 for(const path of ['/api/commerce/stripe/checkout','/api/commerce/stripe/webhook','/api/commerce/stripe/status']){
  const response=await worker.fetch(new Request(origin+path,{method:'POST',headers:{Origin:origin},body:'{}'}),env,{});
  assert.equal(response.status,503);
  assert.match((await response.json()).error,/disabled/);
 }
});
test('unmounted live handler defaults disabled and does not query auth',async()=>{
 let calls=0;
 const r=await handleStripeLiveUnrouted(
  new Request(origin+'/api/commerce/stripe/checkout',{method:'POST',headers:{Origin:origin}}),
  {STRIPE_LIVE_HTTP_ENABLED:'false',STRIPE_LIVE_STAGING_ENABLED:'true'},
  {session:async()=>{calls++;return user}});
 assert.equal(r.status,503);assert.equal(calls,0);
});
test('unmounted live handler denies unauthenticated and cross-origin checkout',async()=>{
 const env={STRIPE_LIVE_HTTP_ENABLED:'true',STRIPE_LIVE_STAGING_ENABLED:'true',
  STRIPE_LIVE_SECRET_KEY:'rk_live_testfake',STRIPE_LIVE_WEBHOOK_SECRET:'whsec_dummy',AUTH_DB:{}};
 const r=await handleStripeLiveUnrouted(
  new Request(origin+'/api/commerce/stripe/checkout',{method:'POST',headers:{Origin:origin}}),
  env,{session:async()=>null});
 assert.equal(r.status,401);
 const bad=await handleStripeLiveUnrouted(
  new Request(origin+'/api/commerce/stripe/checkout',{method:'POST',headers:{Origin:'https://example.com'}}),
  env,{session:async()=>user});
 assert.equal(bad.status,403);
});
test('unmounted live handler rejects webhook without a signed Stripe body',async()=>{
 const env={STRIPE_LIVE_HTTP_ENABLED:'true',STRIPE_LIVE_STAGING_ENABLED:'true',
  STRIPE_LIVE_SECRET_KEY:'rk_live_testfake',STRIPE_LIVE_WEBHOOK_SECRET:'whsec_dummy',AUTH_DB:{}};
 const r=await handleStripeLiveUnrouted(
  new Request(origin+'/api/commerce/stripe/webhook',{method:'POST',body:'{}'}),
  env);
 assert.equal(r.status,400);
});

test('configured authenticated live controller serves private order status without payment action',async()=>{
 const env={STRIPE_LIVE_HTTP_ENABLED:'true',STRIPE_LIVE_STAGING_ENABLED:'true',
  STRIPE_LIVE_SECRET_KEY:'rk_live_testfake',STRIPE_LIVE_WEBHOOK_SECRET:'whsec_dummy',
  AUTH_DB:{prepare(sql){assert.match(sql,/commerce_stripe_live_intents/);return {bind(){return {async all(){return {results:[]}}}}}}}};
 const r=await handleStripeLiveUnrouted(
  new Request(origin+'/api/commerce/stripe/status',{method:'GET'}),
  env,{session:async()=>user});
 assert.equal(r.status,200);
 assert.deepEqual((await r.json()).orders,[]);
});
