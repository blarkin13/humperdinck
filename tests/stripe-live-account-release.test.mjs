import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {handleStripeLiveUnrouted} from '../src/stripe-managed-live-routes-unrouted.js';
const js=readFileSync(new URL('../website/account/account-production-20261114.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../website/account/index.html',import.meta.url),'utf8');
const dashboard=readFileSync(new URL('../src/account-dashboard.js',import.meta.url),'utf8');
test('buy action displays only when server returns enabled live checkout',()=>{
 assert.match(dashboard,/checkout_available:checkoutReady&&status!=='active'/);
 assert.match(js,/account.purchase\?\.checkout_available===true/);
 assert.match(js,/q\('live-checkout-box'\)\.hidden=!ready/);
 assert.match(html,/id="live-checkout-box"[^>]*hidden/);
 assert.match(html,/Buy Humperdinck Pro — \$49/);
});
test('live checkout POST cannot inject amount or redirect to arbitrary origin',()=>{
 const handler=js.slice(js.indexOf('async function startLiveCheckout()'),js.indexOf('// The Stripe webhook'));
 assert.match(handler,/fetch\('\/api\/commerce\/stripe\/checkout'/);
 assert.doesNotMatch(handler,/body\s*:/);
 assert.match(handler,/target\.hostname!=='checkout\.stripe\.com'/);
 assert.match(handler,/location\.assign\(target\.href\)/);
});
test('server refuses live checkout without current web session',async()=>{
 const base='https://humperdinck.studio';
 const env={STRIPE_LIVE_HTTP_ENABLED:'true',STRIPE_LIVE_STAGING_ENABLED:'true',
  STRIPE_LIVE_SECRET_KEY:'rk_live_example',STRIPE_LIVE_WEBHOOK_SECRET:'whsec_test',
  AUTH_DB:{prepare(){throw Error('must not query DB')}}};
 const r=await handleStripeLiveUnrouted(new Request(base+'/api/commerce/stripe/checkout',{method:'POST',headers:{Origin:base}}),env,{session:async()=>null});
 assert.equal(r.status,401);
});
