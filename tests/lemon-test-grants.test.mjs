import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
import {grantAllowed,handleLemonTest,TEST_PROVIDER} from '../src/lemon-test-commerce.js';
globalThis.crypto ||= webcrypto;

const base='https://humperdinck.studio';
const owner={id:'69fe2546-f0cf-46b8-a8fa-645c79fb3c1a',email:'Tester@Example.invalid',kind:'web'};
const intent='d4f3a929-0c1f-47d8-8bf7-5c62b9ba4d8d';
const env=(extra={})=>({LS_TEST_API_KEY:'k',LS_TEST_WEBHOOK_SECRET:'s',LS_TEST_STORE_ID:'45',LS_TEST_VARIANT_ID:'789',...extra});
function order(kind='order_created',over={}){
 return {meta:{event_name:kind,custom_data:{account_id:owner.id,intent_id:intent}},
  data:{type:'orders',id:'12345',attributes:{test_mode:true,store_id:45,first_order_item:{variant_id:789},
   status:'paid',currency:'USD',total:4900,order_number:51,refunded:false,...over}}};
}
// In-memory D1 stand-in that models pro_licenses' UNIQUE user_id/purchase_ref and the refunded-intent guard.
function db(){
 const s={intent:'started',licenses:[],sql:[]};
 s.AUTH_DB={prepare(sql){s.sql.push(sql);return {bind(...a){return {
  async first(){
   if(sql.includes('FROM auth_users'))return {email:owner.email};
   return {id:intent,user_id:owner.id,status:s.intent};
  },
  async run(){
   if(sql.includes('INSERT OR IGNORE INTO pro_licenses')){
    const [id,user,at,provider,ref]=a;
    if(s.intent==='refunded'||s.licenses.some(l=>l.user_id===user||l.purchase_ref===ref))return {meta:{changes:0}};
    s.licenses.push({id,user_id:user,status:'active',issued_at:at,provider,purchase_ref:ref});return {meta:{changes:1}};
   }
   if(sql.startsWith('UPDATE pro_licenses')){
    const l=s.licenses.find(x=>x.purchase_ref===a[0]&&x.provider===a[1]&&x.user_id===a[2]&&x.status==='active');
    if(l)l.status='refunded';return {meta:{changes:l?1:0}};
   }
   if(sql.startsWith('UPDATE commerce_test_intents'))s.intent=s.intent==='refunded'?'refunded':a[0];
   return {meta:{changes:1}};
  }}}}},
  async batch(t){const out=[];for(const x of t)out.push(await x.run());return out}};
 return s;
}
function hook(cfg,body){
 const raw=JSON.stringify(body),sig=createHmac('sha256','s').update(raw).digest('hex');
 return handleLemonTest(new Request(base+'/api/commerce/test/webhook',{method:'POST',
  headers:{'X-Signature':sig,'X-Event-Name':body.meta.event_name,'Content-Type':'application/json'},body:raw}),
  cfg,{session:async()=>null});
}

test('allowlist is empty by default and matches emails case-insensitively',()=>{
 assert.equal(grantAllowed(env(),owner.email),false);
 assert.equal(grantAllowed(env({LS_TEST_GRANT_EMAILS:' other@x.invalid , tester@example.invalid'}),owner.email),true);
 assert.equal(grantAllowed(env({LS_TEST_GRANT_EMAILS:'tester@example.invalid'}),null),false);
});

test('without the allowlist a paid test order never touches pro_licenses',async()=>{
 const s=db(),cfg={...env(),AUTH_DB:s.AUTH_DB};
 const r=await hook(cfg,order());
 assert.equal(r.status,200);
 assert.equal((await r.json()).pro_license_granted,false);
 assert.equal(s.licenses.length,0);
 assert.equal(s.sql.some(x=>/pro_licenses/.test(x)),false);
});

test('allowlisted paid test order grants one marked license; replay is idempotent',async()=>{
 const s=db(),cfg={...env({LS_TEST_GRANT_EMAILS:'tester@example.invalid'}),AUTH_DB:s.AUTH_DB};
 const first=await (await hook(cfg,order())).json();
 assert.equal(first.pro_license_granted,true);
 assert.equal((await (await hook(cfg,order())).json()).pro_license_granted,false);
 assert.equal(s.licenses.length,1);
 assert.equal(s.licenses[0].provider,TEST_PROVIDER);
 assert.equal(s.licenses[0].purchase_ref,'lstest:12345');
 assert.equal(s.licenses[0].user_id,owner.id);
});

test('an existing (e.g. complimentary) license is preserved, not replaced',async()=>{
 const s=db(),cfg={...env({LS_TEST_GRANT_EMAILS:'tester@example.invalid'}),AUTH_DB:s.AUTH_DB};
 s.licenses.push({id:'comp',user_id:owner.id,status:'active',provider:'complimentary',purchase_ref:null});
 assert.equal((await (await hook(cfg,order())).json()).pro_license_granted,false);
 assert.deepEqual(s.licenses.map(l=>l.id),['comp']);
 // A refund of that test order must not touch the complimentary license.
 await hook(cfg,order('order_refunded',{refunded:true,status:'refunded'}));
 assert.equal(s.licenses[0].status,'active');
});

test('full refund marks only the test license refunded; partial refund and late replay do not regrant',async()=>{
 const s=db(),cfg={...env({LS_TEST_GRANT_EMAILS:'tester@example.invalid'}),AUTH_DB:s.AUTH_DB};
 await hook(cfg,order());
 await hook(cfg,order('order_refunded',{status:'partially_refunded'}));
 assert.equal(s.licenses[0].status,'active');
 await hook(cfg,order('order_refunded',{refunded:true,status:'refunded'}));
 assert.equal(s.licenses[0].status,'refunded');
 assert.equal((await (await hook(cfg,order())).json()).pro_license_granted,false);
 assert.equal(s.licenses.length,1);
 assert.equal(s.licenses[0].status,'refunded');
});

test('refund arriving before the paid event blocks the later grant',async()=>{
 const s=db(),cfg={...env({LS_TEST_GRANT_EMAILS:'tester@example.invalid'}),AUTH_DB:s.AUTH_DB};
 await hook(cfg,order('order_refunded',{refunded:true,status:'refunded'}));
 assert.equal((await (await hook(cfg,order())).json()).pro_license_granted,false);
 assert.equal(s.licenses.length,0);
 assert.ok(s.sql.some(x=>x.includes("status='refunded')")&&x.includes('INSERT OR IGNORE INTO pro_licenses')));
});

test('status reports whether this account is allowlisted',async()=>{
 const cfg={...env({LS_TEST_GRANT_EMAILS:'tester@example.invalid'}),AUTH_DB:{prepare:()=>({bind:()=>({all:async()=>({results:[]})})})}};
 const r=await handleLemonTest(new Request(base+'/api/commerce/test/status'),cfg,{session:async()=>owner});
 assert.equal((await r.json()).test_grants_pro,true);
});
