import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../website/account/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../website/account/account-production-20261114.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../website/account/account.css',import.meta.url),'utf8');
test('long historic order IDs cannot spill across card boundary',()=>{
 assert.match(html,/<details id="purchase-history"[^>]*hidden>/);
 assert.match(html,/<summary>Previous purchase details<\/summary>/);
 assert.match(css,/#purchase-reference\{[^}]*overflow-wrap:anywhere/);
 assert.match(css,/\.purchase-history-facts dd\{[^}]*min-width:0/);
 assert.match(css,/\.purchase-history\[hidden\]/);
});
test('production checkout is one compact panel without duplicate availability footer',()=>{
 assert.match(html,/id="live-checkout-box" class="purchase-offer" hidden/);
 assert.match(css,/\.purchase-offer\[hidden\]/);
 assert.match(js,/q\('purchase-footnote'\)\.hidden=ready/);
 assert.match(html,/Buy Pro — \$49/);
 assert.match(html,/10 device activations/);
});
test('history details can be expanded without losing purchase data',()=>{
 assert.match(js,/history\.hidden=!purchase\.provider&&!purchase\.reference/);
 assert.match(js,/reference\.textContent=purchase\.reference/);
 assert.match(js,/Stripe \(test purchase\)/);
});
