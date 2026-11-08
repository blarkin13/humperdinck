import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {handleAccount} from '../src/account-auth.js';

globalThis.crypto ||= webcrypto;
const base='https://humperdinck.studio';
const sha=value=>createHash('sha256').update(value).digest('base64url');

class MockDB {
 constructor(){
  this.flows=new Map();this.users=new Map();this.sessions=new Map();this.rate=[];
 }
 prepare(sql){
  const database=this;
  return {bind(...args){return {
   async first(){
    if(sql.includes('COUNT(*) AS count FROM auth_rate'))return {count:0};
    if(sql.includes('FROM auth_sessions s JOIN auth_users')){
     const entry=database.sessions.get(args[0]);
     if(!entry||entry.expires_at<=args[1])return null;
     return {...database.users.get(entry.user_id),token_hash:args[0],kind:entry.kind,expires_at:entry.expires_at};
    }
    if(sql.includes('SELECT * FROM auth_device_flows WHERE id='))return database.flows.get(args[0])||null;
    if(sql.includes('SELECT * FROM auth_users WHERE id='))return database.users.get(args[0])||null;
    return null;
   },
   async all(){return {results:[]}},
   async run(){
    if(sql.startsWith('INSERT INTO auth_rate')){database.rate.push(args);return {meta:{changes:1}}}
    if(sql.startsWith('DELETE FROM auth_rate')){database.rate=[];return {meta:{changes:1}}}
    if(sql.startsWith('INSERT INTO auth_device_flows')){
     const [id,code,challenge,expires_at,created_at]=args;
     database.flows.set(id,{id,code,challenge,expires_at,created_at,user_id:null});
     return {meta:{changes:1}};
    }
    if(sql.startsWith('UPDATE auth_device_flows')){
     const [user_id,approved_at,code,cutoff]=args;
     const row=[...database.flows.values()].find(x=>x.code===code&&x.user_id===null&&x.expires_at>cutoff);
     if(!row)return {meta:{changes:0}};
     row.user_id=user_id;row.approved_at=approved_at;return {meta:{changes:1}};
    }
    if(sql.startsWith('DELETE FROM auth_device_flows')){
     const row=database.flows.get(args[0]);
     if(!row||row.user_id!==args[1])return {meta:{changes:0}};
     database.flows.delete(args[0]);return {meta:{changes:1}};
    }
    if(sql.startsWith('INSERT INTO auth_sessions')){
     const [token_hash,user_id,kind,created_at,expires_at]=args;
     database.sessions.set(token_hash,{user_id,kind,created_at,expires_at});
     return {meta:{changes:1}};
    }
    if(sql.startsWith('DELETE FROM auth_sessions')){
     const deleted=database.sessions.delete(args[0]);
     return {meta:{changes:deleted?1:0}};
    }
    throw Error('Unexpected SQL: '+sql);
   }
  }}};
 }
}
function call(path,{method='GET',data=null,cookie='',origin='',authorization=''}={},env={}){
 const headers={};
 if(data){headers['Content-Type']='application/json'}
 if(cookie)headers.Cookie=cookie;
 if(origin)headers.Origin=origin;
 if(authorization)headers.Authorization=authorization;
 return handleAccount(new Request(base+path,{method,headers,body:data?JSON.stringify(data):undefined}),env);
}
test('account service is opt-in, never a fake registration form',async()=>{
 const config=await call('/api/account/config');
 assert.equal((await config.json()).available,false);
 assert.equal((await call('/api/account/me')).status,503);
});
test('Google/Apple stay disabled without actual provider secrets',async()=>{
 const env={AUTH_DB:new MockDB(),AUTH_RATE_SECRET:'development-only-test-pepper'};
 const c=await (await call('/api/account/config',{},env)).json();
 assert.deepEqual(c.providers,{google:false,apple:false});
 assert.equal((await call('/api/account/start/google',{},env)).status,503);
 assert.equal((await call('/api/account/start/apple',{},env)).status,503);
});
test('desktop flow requires a secret verifier, web sign-in, and explicit same-origin approval',async()=>{
 const db=new MockDB(),env={AUTH_DB:db,AUTH_RATE_SECRET:'dev-test',GOOGLE_CLIENT_ID:'google-client',GOOGLE_CLIENT_SECRET:'test-secret'};
 db.users.set('user-1',{id:'user-1',email:'test@example.com',display_name:'A customer'});
 const webToken='a'.repeat(43);
 db.sessions.set(sha(webToken),{user_id:'user-1',kind:'web',expires_at:Math.floor(Date.now()/1000)+600});
 const verifier='v'.repeat(43),challenge=sha(verifier);
 const began=await call('/api/account/device/begin',{method:'POST',data:{challenge}},env);
 assert.equal(began.status,200);
 const {request_id,verification_url}=await began.json();
 const code=new URL(verification_url).searchParams.get('device');
 assert.match(code,/^[A-Z2-7]{10}$/);
 const cookie='__Host-humperdinck_session='+webToken;
 const bad=await call('/api/account/device/approve',{
  method:'POST',data:{code},cookie,origin:'https://malicious.example'},env);
 assert.equal(bad.status,403);
 const noSession=await call('/api/account/device/approve',{
  method:'POST',data:{code},origin:base},env);
 assert.equal(noSession.status,401);
 const wrongProof=await call('/api/account/device/poll',{
  method:'POST',data:{request_id,verifier:'z'.repeat(43)}},env);
 assert.equal(wrongProof.status,404);
 const pending=await call('/api/account/device/poll',{
  method:'POST',data:{request_id,verifier}},env);
 assert.equal(pending.status,202);
 const approved=await call('/api/account/device/approve',{
  method:'POST',data:{code},cookie,origin:base},env);
 assert.equal(approved.status,200);
 assert.equal((await approved.json()).approved,true);
 const completed=await call('/api/account/device/poll',{
  method:'POST',data:{request_id,verifier}},env);
 assert.equal(completed.status,200);
 const result=await completed.json();
 assert.equal(result.status,'complete');
 assert.equal(result.user.email,'test@example.com');
 assert.match(result.access_token,/^[A-Za-z0-9_-]{43}$/);
 const reused=await call('/api/account/device/poll',{
  method:'POST',data:{request_id,verifier}},env);
 assert.equal(reused.status,404);
 const signedOut=await call('/api/account/logout',{method:'POST',authorization:'Bearer '+result.access_token},env);
 assert.equal(signedOut.status,200);
 const unavailable=await call('/api/account/me',{authorization:'Bearer '+result.access_token},env);
 assert.equal((await unavailable.json()).authenticated,false);
});
