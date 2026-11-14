import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('new public Pro terms disclose account/computer binding without promising portable backup',()=>{
 const license=file('website/license/index.html');
 const terms=file('website/terms/index.html');
 const help=file('website/help/index.html');
 const price=file('website/index.html');
 for(const source of [license,terms,help,price]){
  assert.match(source,/(?:computer|device)/i);
  assert.match(source,/(?:sign.in|signing in)/i);
 }
 assert.match(license,/macOS hardware UUID/);
 assert.match(license,/Windows MachineGuid/);
 assert.match(license,/Linux \/etc\/machine-id/);
 assert.match(license,/raw identifier is not transmitted/);
 assert.match(license,/previously issued portable certificates continue to work/i);
 assert.match(help,/If the website shuts down/);
 assert.doesNotMatch(help,/license can be restored with a compatible installer/);
 assert.doesNotMatch(price,/signed offline license backup/);
});
test('privacy and register explicitly describe salted hash, no raw computer IDs',()=>{
 const privacy=file('website/privacy/index.html');
 const register=file('docs/DATA_RETENTION_REGISTER.md');
 for(const s of [privacy,register]){
  assert.match(s,/salted hash/i);
  assert.match(s,/raw (?:computer )?identifier|raw IDs|raw ID/i);
 }
});
test('live account UI describes signed-in activation and contains no cross-machine restore promise',()=>{
 const html=file('website/account/index.html'),script=file('website/account/account-production-20261114.js');
 assert.match(html,/operating system or changing computers|OS reinstall or computer change/i);
 assert.match(script,/copied file cannot activate another computer/);
 assert.doesNotMatch(html,/Restore in the desktop app — even offline/);
 assert.doesNotMatch(script,/You can restore it from the desktop app without an internet connection/);
});
test('legal review calls out old issued certificates and current consumer remedies',()=>{
 assert.match(file('docs/LEGAL_SINGLE_PASS_REVIEW_PACKET_2026-11-12.md'),/already-issued portable licenses remain usable/i);
 assert.match(file('website/refunds/index.html'),/There is no voluntary refund or change-of-mind refund period/);
 assert.match(file('website/refunds/index.html'),/legally required remedies/i);
});
