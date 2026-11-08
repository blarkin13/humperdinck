import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
import {configured,checkedOrder,verifySignature,handleLemonTest} from '../src/lemon-test-commerce.js';
globalThis.crypto ||= webcrypto;

const base='https://humperdinck.studio';
const owner={id:'69fe2546-f0cf-46b8-a8fa-645c79fb3c1a',email:'tester@example.invalid',kind:'web'};
const intent='d4f3a929-0c1f-47d8-8bf7-5c62b9ba4d8d';
const env=()=>({AUTH_DB:{prepare:()=>{throw Error('Not expected for request')}},LS_TEST_API_KEY:'test_api_key',
  LS_TEST_WEBHOOK_SECRET:'test-webhook-secret',LS_TEST_STORE_ID:'45',LS_TEST_VARIANT_ID:'789'});
function sampleOrder(overrides={}){
 return {meta:{event_name:'order_created',custom_data:{account_id:owner.id,intent_id:intent}},
  data:{type:'orders',id:'12345',attributes:{test_mode:true,store_id:45,
   first_order_item:{variant_id:789},status:'paid',currency:'USD',total:4900,order_number:51,
   refunded:false,...overrides}}};
}
function signed(body,secret='test-webhook-secret'){
 const raw=JSON.stringify(body);return {raw,signature:createHmac('sha256',secret).update(raw).digest('hex')};
}
test('sandbox is fully disabled until all test credentials are set',async()=>{
 const cfg=env();delete cfg.LS_TEST_API_KEY;
 assert.equal(configured(cfg),false);
 const r=await handleLemonTest(new Request(base+'/api/commerce/test/checkout',{method:'POST'}),
  cfg,{session:async()=>owner});
 assert.equal(r.status,503);
 assert.equal((await r.json()).error.includes('Live checkout is disabled'),true);
});

test('signature verification rejects malformed and modified webhook bodies',async()=>{
 const body=new TextEncoder().encode(JSON.stringify(sampleOrder()));
 const sig=createHmac('sha256','test-webhook-secret').update(body).digest('hex');
 assert.equal(await verifySignature(body,sig,'test-webhook-secret'),true);
 assert.equal(await verifySignature(body,sig.slice(0,-1)+'0','test-webhook-secret'),sig.endsWith('0'));
 assert.equal(await verifySignature(body,'invalid','test-webhook-secret'),false);
 assert.equal(await verifySignature(new TextEncoder().encode('altered'),sig,'test-webhook-secret'),false);
});

test('only matching store, variant, paid one-time test-mode orders are accepted',()=>{
 const config=env();
 const data=sampleOrder();
 assert.equal(checkedOrder(data,config).status,'paid');
 assert.equal(checkedOrder(sampleOrder({test_mode:false}),config),null);
 assert.equal(checkedOrder(sampleOrder({store_id:46}),config),null);
 assert.equal(checkedOrder(sampleOrder({first_order_item:{variant_id:788}}),config),null);
 assert.equal(checkedOrder(sampleOrder({status:'pending'}),config),null);
 assert.equal(checkedOrder(sampleOrder({refunded:true}),config),null);
 const refund=sampleOrder({refunded:true});refund.meta.event_name='order_refunded';
 assert.equal(checkedOrder(refund,config).status,'refunded');
});

test('test webhook never issues a Pro license, and unsigned requests are refused',async()=>{
 const cfg=env(),statements=[],runs=[];
 cfg.AUTH_DB={
  prepare(sql){statements.push(sql);return {
   bind(...args){return {
    async first(){return {id:intent,user_id:owner.id,status:'started'}},
    async run(){runs.push({sql,args});return {meta:{changes:1}}}
   }}
  }},
  async batch(tasks){for(const t of tasks)await t.run();return []}
 };
 const order=sampleOrder(),{raw,signature}=signed(order);
 const req=(sig=signature,b=raw)=>new Request(base+'/api/commerce/test/webhook',{
  method:'POST',headers:{'Content-Type':'application/json','X-Event-Name':'order_created','X-Signature':sig},
  body:b});
 assert.equal((await handleLemonTest(req('bad'),cfg,{session:async()=>null})).status,401);
 const response=await handleLemonTest(req(),cfg,{session:async()=>null});
 assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{ok:true,mode:'test',pro_license_granted:false});
 assert.equal(statements.some(x=>/pro_licenses|pro_devices/.test(x)),false);
 assert.equal(runs.length,3);
 const nonTest=sampleOrder({test_mode:false}),forged=signed(nonTest);
 assert.equal((await handleLemonTest(req(forged.signature,forged.raw),cfg,{session:async()=>null})).status,400);
});

test('test checkout requires same-origin authenticated website session and forces test_mode true',async()=>{
 const cfg=env();let saved=false,captured=null;
 cfg.AUTH_DB={prepare(sql){return {bind(...args){return {
  async run(){saved=true;return {meta:{changes:1}}}
 }}}}};
 const make=(origin,who)=>handleLemonTest(new Request(base+'/api/commerce/test/checkout',{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'}),
  cfg,{session:async()=>who});
 assert.equal((await make('https://other.invalid',owner)).status,403);
 assert.equal((await make(base,null)).status,401);
 const prior=globalThis.fetch;
 globalThis.fetch=async(_url,opts)=>{
  captured=JSON.parse(opts.body);
  return new Response(JSON.stringify({data:{type:'checkouts',id:'checkout-123',attributes:{
   test_mode:true,url:'https://example.lemonsqueezy.com/checkout/custom/test'
  }}}),{status:200});
 };
 try{
  const r=await make(base,owner);
  assert.equal(r.status,200);
  const response=await r.json();
  assert.equal(response.test_mode,true);
  assert.equal(captured.data.attributes.test_mode,true);
  assert.equal(captured.data.attributes.checkout_data.custom.account_id,owner.id);
  assert.equal(captured.data.attributes.product_options.enabled_variants[0],789);
  assert.equal(saved,true);
 }finally{globalThis.fetch=prior}
});
