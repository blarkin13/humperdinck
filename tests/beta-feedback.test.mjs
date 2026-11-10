import test from 'node:test';
import assert from 'node:assert/strict';
import {handleBetaFeedback} from '../src/beta-feedback.js';

const ownerId='8b9d2ab3-cdbb-44d5-852e-7b99523b2a01';
const userId='31d283a4-50a4-4a61-845e-030ccc3ad3a7';
const otherId='a2d283a4-50a4-4a61-845e-030ccc3ad3a7';
const uuid='5a3b5d3c-5bd0-424d-b6ab-c4775db317de';
const home='https://humperdinck.studio';

function setup(user={id:userId,kind:'web'}){
 const report={id:uuid,user_id:userId,category:'bug',platform:'macos',area:'narration',
  summary:'Test summary',details:'An example problem description',status:'open',created_at:100,updated_at:100};
 const calls=[],bucket=new Map();
 const db={prepare(sql){
  return {bind(...params){calls.push({sql,params});return {
   first:async()=>{
    if(sql.includes('FROM beta_reports WHERE id='))return params[0]===uuid&&(params[1]===userId||params[2]===1)?report:null;
    if(sql.includes('FROM beta_screenshots'))return null;
    return null;
   },all:async()=>({results:sql.includes('FROM beta_reports')?[report]:[]}),
   run:async()=>({meta:{changes:1}})
  }}};
 }};
 const env={BETA_FEEDBACK_ENABLED:'1',ANALYTICS_OWNER_ACCOUNT_ID:ownerId,
  AUTH_DB:db,BETA_SCREENSHOTS:{get:async key=>bucket.get(key)||null,put:async(key,data)=>bucket.set(key,{body:data})}};
 const session=async()=>user;
 return {env,session,calls,report,bucket};
}
const req=(path,method='GET',body=null,origin=home)=>new Request(home+path,{method,
 headers:method==='GET'?{}:{Origin:origin,'Content-Type':'application/json'},
 ...(body==null?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});

test('disabled by default even when logged in',async()=>{
 const {env,session}=setup();delete env.BETA_FEEDBACK_ENABLED;
 const r=await handleBetaFeedback(req('/api/beta/reports'),env,{session});
 assert.equal(r.status,404);
});
test('fail closed without screenshot storage',async()=>{
 const {env,session}=setup();delete env.BETA_SCREENSHOTS;
 const r=await handleBetaFeedback(req('/api/beta/reports'),env,{session});
 assert.equal(r.status,503);
});
test('signed-out and desktop bearer sessions cannot access reports',async()=>{
 const {env}=setup();
 for(const session of [async()=>null,async()=>({id:userId,kind:'desktop'})]){
  const r=await handleBetaFeedback(req('/api/beta/reports'),env,{session});
  assert.equal(r.status,401);
 }
});
test('blocks cross-origin POST',async()=>{
 const {env,session,calls}=setup();
 const r=await handleBetaFeedback(req('/api/beta/reports','POST',{},'https://evil.invalid'),env,{session});
 assert.equal(r.status,403);assert.equal(calls.length,0);
});
test('rejects sensitive or incomplete report contract and missing confirmation',async()=>{
 const {env,session,calls}=setup();
 const data={category:'bug',platform:'macos',area:'narration',summary:'Issue with audio',details:'A fictional bug reproduced',privacyConfirmed:false};
 const r=await handleBetaFeedback(req('/api/beta/reports','POST',data),env,{session});
 assert.equal(r.status,400);assert.equal(calls.length,0);
});
test('accepts valid report through atomic per-user cap',async()=>{
 const {env,session,calls}=setup();
 const data={category:'bug',platform:'macos',area:'narration',summary:'Issue with audio',details:'A fictional bug reproduced',privacyConfirmed:true};
 const r=await handleBetaFeedback(req('/api/beta/reports','POST',data),env,{session});
 assert.equal(r.status,201);const body=await r.json();assert.match(body.id,/^[0-9a-f-]{36}$/);
 assert.match(calls[0].sql,/COUNT\(\*\).*created_at>/);
});
test('owner-only status update and other users cannot access report',async()=>{
 const {env,session}=setup();const request=req('/api/beta/reports/'+uuid,'PATCH',{status:'fixed'});
 assert.equal((await handleBetaFeedback(request,env,{session})).status,405);
 const outsider=async()=>({id:otherId,kind:'web'});
 assert.equal((await handleBetaFeedback(req('/api/beta/reports/'+uuid),env,{session:outsider})).status,404);
 const owner=async()=>({id:ownerId,kind:'web'});
 assert.equal((await handleBetaFeedback(request,env,{session:owner})).status,200);
});
test('rejects executable/svg screenshot content and malformed PNG',async()=>{
 const {env,session}=setup();
 for(const [type,payload] of [['image/svg+xml','<svg/>'],['image/png','not a png']]){
  const r=await handleBetaFeedback(new Request(home+'/api/beta/reports/'+uuid+'/screenshots',{
   method:'POST',headers:{Origin:home,'Content-Type':type},body:payload}),env,{session});
  assert.equal(r.status,400);
 }
});
test('private report details are never cached',async()=>{
 const {env,session}=setup();
 const r=await handleBetaFeedback(req('/api/beta/reports/'+uuid),env,{session});
 assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store');
});
