import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../website/account/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../website/account/account.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../website/account/account.css',import.meta.url),'utf8');

test('privacy dashboard supplies matching actionable controls and status',()=>{
 for(const id of ['account-privacy','privacy-request-kind','download-account-data',
                 'submit-privacy-request','privacy-request-status']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/href="#account-privacy"/);
 assert.match(css,/#account-privacy/);
 assert.match(js,/request\('\/privacy\/export'\)/);
 assert.match(js,/request\('\/privacy\/requests'/);
});
test('privacy UI keeps destructive action behind manual approval',()=>{
 assert.match(js,/confirmation:'REQUEST PRIVACY REVIEW'/);
 assert.match(html,/not automatically executed/);
 assert.doesNotMatch(js,/request\('\/privacy\/delete'/);
 assert.doesNotMatch(html,/Delete my account immediately/);
});
test('account export never writes private data to browser storage',()=>{
 assert.doesNotMatch(js,/localStorage\.setItem|sessionStorage\.setItem/);
 assert.match(js,/downloadJson\('humperdinck-account-export.json',exported\)/);
});

test('deletion review UI discloses online Pro forfeiture and requires separate acknowledgment',()=>{
 assert.match(js,/online Pro access, device activation/);
 assert.match(js,/offline certificates may continue to work/);
 assert.match(js,/forfeitureAcknowledgment:'I UNDERSTAND ACCOUNT DELETION MAY FORFEIT PRO'/);
 assert.match(js,/offlineCertificateAcknowledged:true/);
 assert.doesNotMatch(js,/\/privacy\/delete/);
});
