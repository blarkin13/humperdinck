import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../website/account/index.html',import.meta.url),'utf8');
const script=readFileSync(new URL('../website/account/account-production-20261114.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../website/account/account.css',import.meta.url),'utf8');
test('public Account has no Stripe sandbox purchase button or handlers',()=>{
 assert.doesNotMatch(html,/id="test-checkout"|test-checkout-box|Test \$49 Pro checkout/);
 assert.doesNotMatch(script,/renderTestCheckout|startTestCheckout|\/api\/commerce\/sandbox\/checkout/);
 assert.match(html,/src="\/account\/account-production-20261114\.js"/);
 assert.match(html,/Buy Pro — \$49/);
 assert.match(script,/\/api\/commerce\/stripe\/checkout/);
});
test('hidden purchase controls remain hidden regardless of flex layout',()=>{
 assert.match(css,/\.account-test-checkout\[hidden\]\{display:none\}/);
});
