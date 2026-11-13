import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../website/account/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../website/account/account.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../website/account/account.css',import.meta.url),'utf8');
const start=js.indexOf('function deletionConsentDialog(stage){');
const end=js.indexOf("\nfor(const provider of ['google','apple'])",start);
assert.ok(start>=0&&end>start,'deletion consent modal helper present');

function dialogFixture(){
 const events=new Map();
 const makeButton=()=>({
  events:new Map(),focused:false,
  addEventListener(name,fn){this.events.set(name,fn)},
  removeEventListener(name,fn){if(this.events.get(name)===fn)this.events.delete(name)},
  click(){this.events.get('click')?.()},
  focus(){this.focused=true}
 });
 const accept=makeButton(),cancel=makeButton(),scope={textContent:''};
 const dialog={returnValue:'',open:false,
  addEventListener(name,fn){events.set(name,fn)},
  removeEventListener(name,fn){if(events.get(name)===fn)events.delete(name)},
  showModal(){this.open=true},
  close(value=''){this.open=false;this.returnValue=value;events.get('close')?.()}
 };
 const controls={'deletion-consent-modal':dialog,'deletion-consent-accept':accept,
  'deletion-consent-cancel':cancel,'deletion-consent-scope':scope};
 const helper=runInNewContext('('+js.slice(start,end).trim()+')',{q:id=>controls[id]});
 return {helper,dialog,accept,cancel,scope,events};
}

test('account deletion has a native accessible modal with explicit Accept and Cancel',()=>{
 assert.match(html,/<dialog[^>]*id="deletion-consent-modal"[^>]*aria-labelledby="deletion-consent-title"[^>]*aria-describedby="deletion-consent-warning"/);
 assert.match(html,/id="deletion-consent-cancel"[^>]*>Cancel<\/button>/);
 assert.match(html,/id="deletion-consent-accept"[^>]*>Accept<\/button>/);
 assert.match(html,/online Pro access|online Pro account entitlement/);
 assert.match(html,/purchase, payment, refund, dispute, and tax records/);
 assert.match(html,/offline licenses may still work/);
 assert.match(css,/#deletion-consent-modal:not\(\[open\]\)\{display:none\}/);
});

test('Accept records review approval, Cancel and Escape leave the request unapproved',async()=>{
 const f=dialogFixture();
 const cancelPromise=f.helper('review');
 assert.equal(f.dialog.open,true);
 assert.equal(f.cancel.focused,true);
 assert.match(f.scope.textContent,/does not delete/i);
 f.cancel.click();
 assert.equal(await cancelPromise,false);
 assert.equal(f.dialog.open,false);
 assert.equal(f.accept.events.size,0);
 const acceptPromise=f.helper('final');
 assert.match(f.scope.textContent,/time-limited/);
 f.accept.click();
 assert.equal(await acceptPromise,true);
 const escapePromise=f.helper('review');
 f.dialog.close('');
 assert.equal(await escapePromise,false);
});

test('deletion actions require the modal, exact final phrase and independent server consent',()=>{
 assert.match(js,/kind==='deletion'\)\{\s*if\(!await deletionConsentDialog\('review'\)\)return/);
 assert.match(js,/if\(!await deletionConsentDialog\('final'\)\)return/);
 assert.match(js,/DELETE MY HUMPERDINCK ACCOUNT/);
 assert.match(js,/deletion-forfeiture/);
 assert.match(js,/deletion-offline/);
 assert.doesNotMatch(js,/if\(kind==='deletion'&&!confirm/);
});
