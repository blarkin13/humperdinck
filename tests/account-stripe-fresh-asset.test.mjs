import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/model-proxy-worker.js';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Account loads an entirely new Stripe-only script path and does not cache checkout logic',()=>{
 const html=load('website/account/index.html'),js=load('website/account/account-live-20261114.js'),headers=load('website/_headers');
 assert.match(html,/src="\/account\/account-stripe-20261114\.js"/);
 assert.doesNotMatch(html,/<script src="\/account\/account\.js/);
 assert.match(js,/\/api\/commerce\/sandbox\/checkout/);
 assert.match(js,/\/api\/commerce\/stripe\/checkout/);
 assert.match(js,/target\.hostname!=='checkout\.stripe\.com'/);
 assert.doesNotMatch(js,/\/api\/commerce\/test\/checkout/);
 assert.doesNotMatch(js,/\.lemonsqueezy\.com/);
 for(const path of ['/account/','/account/account-live-20261114.js'])
  assert.match(headers,new RegExp(path.replaceAll('/','\\/')+'\\n  Cache-Control: no-store'));
});
test('legacy Lemon checkout cannot run when Stripe sandbox mode is active',async()=>{
 const r=await worker.fetch(new Request('https://humperdinck.studio/api/commerce/test/checkout',{method:'POST',headers:{Origin:'https://humperdinck.studio'},body:'{}'}),{STRIPE_SANDBOX_HTTP_ENABLED:'true'},{});
 assert.equal(r.status,410);
 assert.match((await r.json()).error,/retired/);
});
