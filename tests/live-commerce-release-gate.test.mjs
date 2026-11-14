import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/model-proxy-worker.js';
import {LIVE_COMMERCE_CODE_APPROVED,isReservedProductionCommercePath,handleUnreleasedProductionCommerce} from '../src/live-commerce-release-gate.js';

const base='https://humperdinck.studio';
const reserved=[
 '/api/commerce/live',
 '/api/commerce/live/',
 '/api/commerce/live/checkout',
 '/api/commerce/live/webhook',
 '/api/commerce/live/fulfill',
 '/api/commerce/live/license',
 '/api/commerce/stripe',
 '/api/commerce/stripe/checkout',
 '/api/commerce/stripe/webhook',
 '/api/commerce/production',
 '/api/commerce/production/checkout',
 '/api/commerce/production/webhook',
 '/api/commerce/checkout',
 '/api/commerce/webhook'
];
test('production commerce paths are reserved, without interfering with sandbox',()=>{
 for(const path of reserved)assert.equal(isReservedProductionCommercePath(path),true,path);
 for(const path of ['/api/commerce/test/checkout','/api/commerce/test/webhook',
  '/api/account/me','/downloads.json','/api/commerce/liveish','/api/commerce/webhooks'])
  assert.equal(isReservedProductionCommercePath(path),false,path);
 assert.equal(LIVE_COMMERCE_CODE_APPROVED,true);
});
test('unknown commerce paths and unconfigured live Stripe always fail closed',async()=>{
 for(const path of reserved){
  for(const method of ['GET','POST','PUT','DELETE','OPTIONS','HEAD']){
   let assetsCalls=0,dbCalls=0;
   const env={
    LS_LIVE_CHECKOUT_ENABLED:true,LS_LIVE_FULFILLMENT_ENABLED:true,
    LS_LIVE_WEBHOOK_ENABLED:true,LS_LIVE_ISSUANCE_ENABLED:true,
    LS_LIVE_API_KEY:'live_api_secret',LS_LIVE_WEBHOOK_SECRET:'live_webhook_secret',
    LS_LIVE_STORE_ID:'45',LS_LIVE_VARIANT_ID:'789',LS_LIVE_PRICE_CENTS:4900,
    LS_LIVE_CURRENCY:'USD',
    AUTH_DB:{prepare(){dbCalls++;throw Error('Live database must not be reached')}},
    ASSETS:{fetch(){assetsCalls++;throw Error('Static fallback must never serve live commerce')}}
   };
   const req=new Request(base+path,{method,headers:{
    Origin:base,'X-Signature':'a'.repeat(64),'X-Event-Name':'order_created',
    Authorization:'Bearer '+('b'.repeat(50))
   },...(method==='POST'||method==='PUT'?{body:'{"event":"order_created"}'}:{})});
   const response=await worker.fetch(req,env,{});
   assert.equal(response.status,503,path+' '+method);
   assert.equal(response.headers.get('Cache-Control'),'no-store');
   assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
   assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
   if(method!=='HEAD'){
    const payload=await response.json();
    if(!path.startsWith('/api/commerce/stripe/')){
     assert.equal(payload.live_checkout_available,false);
     assert.equal(payload.live_fulfillment_available,false);
    }
    assert.doesNotMatch(JSON.stringify(payload),/live_api_secret|live_webhook_secret/);
   }
   assert.equal(assetsCalls,0);
   assert.equal(dbCalls,0);
  }
 }
});
test('deployment config sends reserved routes to the Worker, never static assets',()=>{
 const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 const routes=config.assets.run_worker_first;
 for(const prefix of ['/api/commerce/live*','/api/commerce/production*','/api/commerce/stripe*',
  '/api/commerce/checkout','/api/commerce/webhook'])
   assert.equal(routes.includes(prefix),true,prefix);
 assert.equal(config.main,'src/model-proxy-worker.js');
});
test('only the explicit Stripe path is live-routed; legacy routes remain unavailable',()=>{
 const file=readFileSync(new URL('../src/model-proxy-worker.js',import.meta.url),'utf8');
 assert.match(file,/if\(url\.pathname\.startsWith\('\/api\/commerce\/stripe\/'\)\)/);
 assert.match(file,/handleStripeLiveUnrouted\(request,env,\{session:accountSession\}\)/);
 assert.match(file,/if\(isReservedProductionCommercePath\(url\.pathname\)\)return handleUnreleasedProductionCommerce\(request\)/);
 assert.doesNotMatch(file,/import\s*\{[^}]*\}\s*from\s*['"]\.\/lemon-live-(intents|settlement|refund|preflight|disputes)\.js['"]/);
 const disabled=handleUnreleasedProductionCommerce(new Request(base+'/api/commerce/live/webhook'));
 assert.equal(disabled.status,503);
});
