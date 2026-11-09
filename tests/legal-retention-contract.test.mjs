/* Static legal/privacy integrity checks; no production accounts or commerce changes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('the cookie notice discloses actual account cookies without confusing them with analytics',()=>{
 const html=read('website/cookies/index.html'),auth=read('src/account-auth.js');
 assert.match(auth,/__Host-humperdinck_session/);
 assert.match(auth,/__Host-humperdinck_oauth/);
 assert.match(html,/__Host-humperdinck_session/);
 assert.match(html,/__Host-humperdinck_oauth_/);
 assert.match(html,/Cloudflare Web Analytics/);
 assert.match(html,/Essential account authentication cookies are separate/);
 assert.doesNotMatch(html,/Certain commercial, account and community features are not yet available/);
 assert.doesNotMatch(html,/\[VERIFY BEFORE LAUNCH:/);
});

test('published account privacy terms do not promise automatic deletion or remote revocation',()=>{
 const privacy=read('website/privacy/index.html');
 const terms=read('website/terms/index.html');
 const ops=read('docs/ACCOUNT_PRIVACY_REQUEST_OPERATIONS.md');
 const preflight=read('src/account-deletion-preflight.js');
 assert.match(privacy,/may lose online Pro device activation and account-based license recovery/);
 assert.match(privacy,/offline certificate may continue to function/);
 assert.match(terms,/cannot be remotely revoked/);
 assert.match(ops,/Actual account\s+deletion remains disabled/);
 assert.match(preflight,/mayDelete:false/);
 assert.doesNotMatch(privacy,/account deletion is immediate/i);
});

test('retention register distinguishes implemented expiries from approved erasure',()=>{
 const register=read('docs/DATA_RETENTION_REGISTER.md');
 const auth=read('src/account-auth.js');
 for(const name of ['auth_users','auth_sessions','auth_flows','auth_device_flows',
 'auth_rate','auth_recovery_codes','auth_privacy_requests','pro_licenses',
 'commerce_live_orders','commerce_live_disputes']){
  assert.ok(register.includes(name),'missing retention inventory for '+name);
 }
 assert.match(auth,/WEB_TTL = 30 \* 86400, DESKTOP_TTL = 90 \* 86400, FLOW_TTL = 600/);
 assert.match(register,/opportunistically/);
 assert.match(register,/NOT a legally approved retention schedule/);
 assert.match(register,/UNSET/);
 assert.match(register,/Account deletion and live checkout remain disabled/);
});
