import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../website/account/account-live-20261114.js',import.meta.url),'utf8');
test('purchase footnote is populated after normal purchase renderer',()=>{
 const start=js.indexOf('async function refresh(){'),end=js.indexOf('async function refreshOwnerAnalytics',start);
 const refresh=js.slice(start,end);
 assert.ok(refresh.indexOf('renderPurchase(account,license)')>=0);
 assert.ok(refresh.indexOf('renderLiveCheckout(account)')>refresh.indexOf('renderPurchase(account,license)'));
});
test('refunded test provider is explicitly labeled as historical test',()=>{
 assert.match(js,/purchase\.provider==='stripe-managed-test'\?'Stripe \(refunded test purchase\)'/);
 assert.match(js,/q\('purchase-reference'\)\.title=purchase\.reference/);
});
