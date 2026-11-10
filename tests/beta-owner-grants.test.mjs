import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleBetaFeedback,purgeOldBetaGrants} from '../src/beta-feedback.js';

globalThis.crypto ||= webcrypto;
const home='https://humperdinck.studio';
const ownerId='8b9d2ab3-cdbb-44d5-852e-7b99523b2a01';
const testerId='31d283a4-50a4-4a61-845e-030ccc3ad3a7';
const newTester='other@example.test';
const make=({kind='web',id=ownerId,enabled=true}={})=>{
 const calls=[];
 const db={prepare(sql){return {bind(...args){calls.push({sql,args});return {
  first:async()=>sql.includes('FROM auth_users u JOIN auth_identities')?{id:testerId}:null,
  run:async()=>({meta:{changes:1}}),all:async()=>({results:[]})
 };}},all:async()=>({results:[]})}}};
 const env={AUTH_DB:db,BETA_FEEDBACK_ENABLED:'1',BETA_PRO_ENABLED:enabled?'1':'0',
  ANALYTICS_OWNER_ACCOUNT_ID:ownerId,BETA_SCREENSHOTS:{get:async()=>null,put:async()=>{}}};
 return {env,calls,session:async()=>({id,kind})};
};
const req=(path,method='GET',body,origin=home)=>new Request(home+path,{
 method,headers:method==='GET'?{}:{Origin:origin,'Content-Type':'application/json'},
 ...(body===undefined?{}:{body:JSON.stringify(body)})});
test('only verified owner can list or grant beta access',async()=>{
 const me=make({id:testerId});
 assert.equal((await handleBetaFeedback(req('/api/beta/admin/grants'),me.env,{session:me.session})).status,404);
 assert.equal((await handleBetaFeedback(req('/api/beta/admin/grants','POST',{email:newTester}),me.env,{session:me.session})).status,404);
 assert.equal(me.calls.length,0);
});
test('owner must have both beta feature switches, and cross-origin writes forbidden',async()=>{
 const disabled=make({enabled:false});
 assert.equal((await handleBetaFeedback(req('/api/beta/admin/grants'),disabled.env,{session:disabled.session})).status,404);
 const enabled=make();
 assert.equal((await handleBetaFeedback(req('/api/beta/admin/grants','POST',{email:newTester},'https://evil.invalid'),enabled.env,{session:enabled.session})).status,403);
});
test('owner grants exactly 30 days to existing Google-signed-in tester',async()=>{
 const x=make();
 const r=await handleBetaFeedback(req('/api/beta/admin/grants','POST',{email:newTester}),x.env,{session:x.session});
 assert.equal(r.status,201);
 const obj=await r.json();
 assert.equal(obj.expires_at-obj.issued_at,30*86400);
 assert.equal(obj.temporary,true);
 assert.ok(x.calls.some(v=>v.sql.includes("i.provider='google'")));
 assert.ok(x.calls.some(v=>v.sql.includes('NOT EXISTS')));
});
test('owner can revoke online renewals, not previously signed offline access',async()=>{
 const x=make(),uuid='5a3b5d3c-5bd0-424d-b6ab-c4775db317de';
 const r=await handleBetaFeedback(req('/api/beta/admin/grants/'+uuid+'/revoke','POST'),x.env,{session:x.session});
 assert.equal(r.status,200);
 assert.match((await r.json()).warning,/offline beta certificates/);
 assert.ok(x.calls.some(v=>v.sql.includes('UPDATE beta_pro_grants')));
});

test('expired beta grant cleanup uses a bounded timestamp and never touches purchase tables',async()=>{
 const x=make(),at=1_700_000_000;
 const result=await purgeOldBetaGrants(x.env,{cutoff:at});
 assert.deepEqual(result,{deleted:1,skipped:false});
 const query=x.calls.find(c=>c.sql.startsWith('DELETE FROM beta_pro_grants'));
 assert.ok(query);
 assert.deepEqual(query.args,[at,at]);
 assert.equal(x.calls.some(c=>c.sql.includes('pro_licenses')),false);
});
