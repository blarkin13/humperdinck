import test from 'node:test';
import assert from 'node:assert/strict';
import {handleBetaFeedback,purgeOldBetaFeedback} from '../src/beta-feedback.js';

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

test('valid PNG screenshot is stored only in private R2 with a generated key',async()=>{
 const {env,session,bucket,calls}=setup();
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64');
 const response=await handleBetaFeedback(new Request(home+'/api/beta/reports/'+uuid+'/screenshots',{
   method:'POST',headers:{Origin:home,'Content-Type':'image/png'},body:png}),env,{session});
 assert.equal(response.status,201);
 assert.equal(bucket.size,1);
 const key=[...bucket.keys()][0];
 assert.match(key,new RegExp('^beta/'+uuid+'/[0-9a-f-]{36}\\.png$'));
 assert.ok(calls.some(x=>x.sql.includes('COUNT(*) FROM beta_screenshots')));
});
test('self deletion erases D1 references and private R2 objects',async()=>{
 const {env,session,calls}=setup();
 const deleted=[];
 env.BETA_SCREENSHOTS.delete=async key=>deleted.push(key);
 const previousPrepare=env.AUTH_DB.prepare.bind(env.AUTH_DB);
 env.AUTH_DB.prepare=(sql)=>{
  if(sql.includes('SELECT object_key FROM beta_screenshots WHERE report_id=')){
   return {bind:()=>({all:async()=>({results:[{object_key:'beta/'+uuid+'/s.png'}]})})};
  }
  return previousPrepare(sql);
 };
 const response=await handleBetaFeedback(req('/api/beta/reports/'+uuid,'DELETE'),env,{session});
 assert.equal(response.status,200);
 assert.deepEqual(deleted,['beta/'+uuid+'/s.png']);
 assert.ok(calls.some(x=>x.sql.startsWith('DELETE FROM beta_reports')));
});
test('ninety-day cleanup continues when intake disabled, and skips only missing bindings',async()=>{
 const {env,calls}=setup();delete env.BETA_FEEDBACK_ENABLED;
 const result=await purgeOldBetaFeedback(env,{cutoff:42});
 assert.deepEqual(result,{deleted:0,skipped:false});
 assert.ok(calls.some(x=>x.sql.includes('SELECT id FROM beta_reports WHERE created_at<')));
 delete env.BETA_SCREENSHOTS;
 assert.deepEqual(await purgeOldBetaFeedback(env,{cutoff:42}),{deleted:0,skipped:true});
});
test('bounded retention purge removes R2 object before D1 record',async()=>{
 const {env,calls}=setup();const order=[];
 const previousPrepare=env.AUTH_DB.prepare.bind(env.AUTH_DB);
 env.AUTH_DB.prepare=sql=>{
  if(sql.includes('SELECT id FROM beta_reports WHERE created_at<')){
   return {bind:(...params)=>({all:async()=>{assert.equal(params[1],50);return {results:[{id:uuid}]};}})};
  }
  if(sql.includes('SELECT object_key FROM beta_screenshots WHERE report_id=')){
   return {bind:()=>({all:async()=>({results:[{object_key:'beta/'+uuid+'/s.png'}]})})};
  }
  if(sql.startsWith('DELETE')){return {bind:()=>({run:async()=>{order.push('database');return {meta:{changes:1}};}})}}
  return previousPrepare(sql);
 };
 env.BETA_SCREENSHOTS.delete=async key=>{assert.match(key,/beta\//);order.push('r2');};
 const result=await purgeOldBetaFeedback(env,{cutoff:42,limit:1000});
 assert.deepEqual(result,{deleted:1,skipped:false});
 assert.deepEqual(order,['r2','database','database']);
});

test('screenshot retrieval denies an unrelated web account while allowing submitter and owner',async()=>{
 const {env,session}=setup();
 const imageId='472b57aa-409e-45e1-9d61-c0b060c96bf4';
 const key='beta/'+uuid+'/'+imageId+'.png';
 const previous=env.AUTH_DB.prepare.bind(env.AUTH_DB);
 env.AUTH_DB.prepare=sql=>{
  if(sql.includes('SELECT object_key FROM beta_screenshots WHERE id=?')){
   return {bind:()=>({first:async()=>({object_key:key})})};
  }
  return previous(sql);
 };
 env.BETA_SCREENSHOTS.get=async candidate=>candidate===key?{body:new Uint8Array([137,80,78,71])}:null;
 const path='/api/beta/reports/'+uuid+'/screenshots/'+imageId;
 const stranger=async()=>({id:otherId,kind:'web'});
 let response=await handleBetaFeedback(req(path),env,{session:stranger});
 assert.equal(response.status,404);
 response=await handleBetaFeedback(req(path),env,{session});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.match(response.headers.get('Content-Security-Policy'),/sandbox/);
 const owner=async()=>({id:ownerId,kind:'web'});
 response=await handleBetaFeedback(req(path),env,{session:owner});
 assert.equal(response.status,200);
});
test('screenshot upload rejects spoofed CRC and unwanted metadata tampering',async()=>{
 const {env,session}=setup();
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==','base64');
 const modified=Buffer.from(png);modified[29]^=1;
 const request=new Request(home+'/api/beta/reports/'+uuid+'/screenshots',{
  method:'POST',headers:{Origin:home,'Content-Type':'image/png'},body:modified});
 const response=await handleBetaFeedback(request,env,{session});
 assert.equal(response.status,400);
});
