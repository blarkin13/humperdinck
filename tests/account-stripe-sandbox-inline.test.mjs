import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../website/account/account.js',import.meta.url),'utf8');
const markup=readFileSync(new URL('../website/account/index.html',import.meta.url),'utf8');

test('account purchase card uses only account-authenticated Stripe test API',()=>{
 assert.match(source,/\/api\/commerce\/sandbox\/status/);
 assert.match(source,/\/api\/commerce\/sandbox\/checkout/);
 assert.doesNotMatch(source,/\/api\/commerce\/test\/checkout/);
 assert.doesNotMatch(source,/\.lemonsqueezy\.com/);
 assert.match(source,/if\(!response\.ok\)return;[\s\S]*?if\(status\.mode!=='test'\)return;/);
 assert.doesNotMatch(markup,/test-checkout-box|Test \$49 Pro checkout with Stripe/);
 assert.match(markup,/Buy Humperdinck Pro — \$49/);
});
test('Stripe redirects in current tab, no popup; no checkout body is sent',()=>{
 const start=source.indexOf('async function startTestCheckout()');
 const stop=source.indexOf('// The Stripe webhook',start);
 const handler=source.slice(start,stop);
 assert.match(handler,/method:'POST'/);
 assert.doesNotMatch(handler,/body\s*:/);
 assert.match(handler,/target\.hostname!=='checkout\.stripe\.com'/);
 assert.match(handler,/location\.assign\(target\.href\)/);
 assert.doesNotMatch(handler,/window\.open\(|target=['"]_blank/);
});
test('Stripe return status is verified through account dashboard before telling customer Pro is active',()=>{
 assert.match(source,/params\.get\('stripe'\)!=='return'/);
 assert.match(source,/if\(state\.dashboard\?\.purchase\?\.status==='active'\)/);
 assert.match(source,/webhook delivery before trying again/);
});
