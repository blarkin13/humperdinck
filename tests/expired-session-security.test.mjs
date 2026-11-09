/* Account security acceptance: expired sessions must not mutate private
 * state, even from the correct origin with otherwise plausible payloads.
 * Uses the actual Worker router; no external Cloudflare data is touched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import worker from '../src/model-proxy-worker.js';
globalThis.crypto ||= webcrypto;
const BASE='https://humperdinck.studio';
const TOKEN='q'.repeat(43);
const SHA=createHash('sha256').update(TOKEN).digest('base64url');
const id='12345678-1234-4234-8234-000000000001';
const routes=[
 {path:'/api/account/device/approve',body:{code:'ABCDEFGHIJ'}},
 {path:'/api/account/privacy/requests',body:{
  kind:'deletion',confirmation:'REQUEST PRIVACY REVIEW',
  forfeitureAcknowledgment:'I UNDERSTAND ACCOUNT DELETION MAY FORFEIT PRO',
  offlineCertificateAcknowledged:true}},
 {path:'/api/account/dashboard/recovery/codes',body:{}},
 {path:'/api/account/dashboard/connections/revoke-all',body:{}},
 {path:'/api/account/dashboard/connections/'+id+'/revoke',body:{}},
 {path:'/api/account/license/devices/'+id+'/deactivate',body:{}},
 {path:'/api/account/license/activate',bearer:true,
  body:{installation_id:id,label:'Expired client'}},
 {path:'/api/commerce/test/checkout',body:{}}
];
function setup(){
 const writes=[];
 const db={prepare(sql){
  return {bind(...args){return {
   async first(){
    // Simulate a once-valid web/desktop session that expired yesterday.
    // If auth queries ever stop checking expiry, this test will fail.
    if(sql.includes('FROM auth_sessions s JOIN auth_users')){
     assert.equal(args[0],SHA);
     assert.equal(typeof args[1],'number');
     const expires=Math.floor(Date.now()/1000)-86400;
     return expires>args[1]?{
      id:id,display_name:'Expired',email:'expired@example.invalid',
      token_hash:SHA,kind:'web',expires_at:expires
     }:null;
    }
    if(sql.includes('COUNT(*)'))return {count:0};
    return null;
   },
   async all(){return {results:[]}},
   async run(){writes.push(sql);return {meta:{changes:1}}}
  }}};
 }};
 return {writes,env:{
  AUTH_DB:db,AUTH_RATE_SECRET:'testing-only',AUTH_PUBLIC_ORIGIN:BASE,
  GOOGLE_CLIENT_ID:'test-google',GOOGLE_CLIENT_SECRET:'test-secret',
  LS_TEST_API_KEY:'test-api',LS_TEST_STORE_ID:'45',
  LS_TEST_VARIANT_ID:'789',LS_TEST_WEBHOOK_SECRET:'test-webhook'
 }};
}
for(const route of routes){
 test('expired session cannot mutate '+route.path,async()=>{
  const f=setup();
  const headers={
   Origin:BASE,'Content-Type':'application/json',
   Cookie:'__Host-humperdinck_session='+TOKEN
  };
  if(route.bearer)headers.Authorization='Bearer '+TOKEN;
  const response=await worker.fetch(new Request(BASE+route.path,{
   method:'POST',headers,body:JSON.stringify(route.body)
  }),f.env,{waitUntil(){}});
  assert.ok([401,403,404].includes(response.status),
   route.path+' status '+response.status);
  assert.equal(f.writes.length,0,route.path+' performed a D1 write');
 });
}
test('expired account does not report authenticated or Pro access',async()=>{
 const f=setup(),headers={Cookie:'__Host-humperdinck_session='+TOKEN};
 const r=await worker.fetch(new Request(BASE+'/api/account/me',{headers}),f.env,{waitUntil(){}});
 assert.equal(r.status,200);
 assert.equal((await r.json()).authenticated,false);
 const pro=await worker.fetch(new Request(BASE+'/api/account/license',{headers}),f.env,{waitUntil(){}});
 assert.equal(pro.status,401);
 assert.deepEqual(f.writes,[]);
});
