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

class OAuthDB extends MockDB {
 constructor(){super();this.oauthFlows=new Map();this.identities=new Map();}
 prepare(sql){
  const db=this;
  if(sql.includes('auth_flows')||sql.includes('auth_identities')||sql.startsWith('INSERT INTO auth_users')||sql.startsWith('UPDATE auth_users')){
   return {bind(...args){return {
    async first(){
     if(sql.includes('SELECT * FROM auth_flows')){
      const row=db.oauthFlows.get(args[0]);
      return row&&row.provider===args[1]&&row.expires_at>args[2]?row:null;
     }
     if(sql.includes('SELECT user_id FROM auth_identities')){
      const user_id=db.identities.get(args[0]+'|'+args[1]);
      return user_id?{user_id}:null;
     }
     return null;
    },
    async all(){
     if(sql.includes('SELECT provider FROM auth_identities')){
      return {results:[...db.identities.entries()].filter(([key,user])=>user===args[0]).map(([key])=>({provider:key.split('|')[0]}))};
     }
     return {results:[]};
    },
    async run(){
     if(sql.startsWith('DELETE FROM auth_flows WHERE expires_at')){
      for(const [key,flow] of db.oauthFlows){if(flow.expires_at<args[0])db.oauthFlows.delete(key)}
      return {meta:{changes:1}};
     }
     if(sql.startsWith('INSERT INTO auth_flows')){
      const [state_hash,provider,nonce,verifier,return_path,expires_at]=args;
      db.oauthFlows.set(state_hash,{state_hash,provider,nonce,verifier,return_path,expires_at});
      return {meta:{changes:1}};
     }
     if(sql.startsWith('DELETE FROM auth_flows WHERE state_hash')){
      return {meta:{changes:db.oauthFlows.delete(args[0])?1:0}};
     }
     if(sql.startsWith('INSERT INTO auth_users')){
      const [id,display_name,email,created_at]=args;
      db.users.set(id,{id,display_name,email,created_at});
      return {meta:{changes:1}};
     }
     if(sql.startsWith('INSERT INTO auth_identities')){
      db.identities.set(args[0]+'|'+args[1],args[2]);
      return {meta:{changes:1}};
     }
     if(sql.startsWith('UPDATE auth_users'))return {meta:{changes:1}};
     throw Error('Unexpected OAuth SQL: '+sql);
    }
   }}};
  }
  return super.prepare(sql);
 }
}

test('Google OIDC callback validates signed ID token, audience, nonce, and one-time state',async()=>{
 const db=new OAuthDB(), env={AUTH_DB:db,AUTH_RATE_SECRET:'test-pepper',
   GOOGLE_CLIENT_ID:'google-test-client',GOOGLE_CLIENT_SECRET:'test-secret'};
 const keyPair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
   publicExponent:Uint8Array.from([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',keyPair.publicKey);
 jwk.kid='test-kid';jwk.alg='RS256';
 const originalFetch=globalThis.fetch;
 let expectedNonce='';
 let claimModifier=null;
 globalThis.fetch=async(url,opts)=>{
  if(String(url)==='https://oauth2.googleapis.com/token'){
   const values=new URLSearchParams(opts.body);
   assert.equal(values.get('client_id'),env.GOOGLE_CLIENT_ID);
   assert.equal(values.get('grant_type'),'authorization_code');
   const header=Buffer.from(JSON.stringify({alg:'RS256',kid:'test-kid'})).toString('base64url');
   const payload={iss:'https://accounts.google.com',aud:env.GOOGLE_CLIENT_ID,
     sub:'user-oidc-test',email:'valid@example.com',email_verified:true,
     nonce:expectedNonce,iat:Math.floor(Date.now()/1000)-30,exp:Math.floor(Date.now()/1000)+300};
   if(claimModifier)claimModifier(payload);
   const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
   const raw=header+'.'+body;
   const signed=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keyPair.privateKey,new TextEncoder().encode(raw));
   return new Response(JSON.stringify({id_token:raw+'.'+Buffer.from(signed).toString('base64url')}),{status:200});
  }
  if(String(url)==='https://www.googleapis.com/oauth2/v3/certs'){
   return new Response(JSON.stringify({keys:[jwk]}),{status:200});
  }
  throw Error('Unexpected upstream request '+url);
 };
 try{
  let started=await call('/api/account/start/google',{},env);
  assert.equal(started.status,303);
  let login=new URL(started.headers.get('location'));
  expectedNonce=login.searchParams.get('nonce');
  const state=login.searchParams.get('state');
  const csrfCookie=started.headers.get('set-cookie').split(';')[0];
  assert.match(expectedNonce,/^[A-Za-z0-9_-]{43}$/);
  assert.equal(login.searchParams.get('code_challenge_method'),'S256');
  const callback=await call('/api/account/callback/google?code=once&state='+state,{cookie:csrfCookie},env);
  assert.equal(callback.status,303);
  assert.equal(callback.headers.get('Location'),base+'/account/');
  const sessionCookie=callback.headers.get('set-cookie').split(';')[0];
  assert.ok(sessionCookie.startsWith('__Host-humperdinck_session='));
  const account=await (await call('/api/account/me',{cookie:sessionCookie},env)).json();
  assert.equal(account.authenticated,true);
  assert.equal(account.user.email,'valid@example.com');
  assert.deepEqual(account.user.providers,['google']);
  const replay=await call('/api/account/callback/google?code=once&state='+state,{cookie:csrfCookie},env);
  assert.equal(replay.status,400);
  started=await call('/api/account/start/google',{},env);
  login=new URL(started.headers.get('location'));
  expectedNonce=login.searchParams.get('nonce');
  claimModifier=payload=>{payload.aud='incorrect-audience'};
  const rejected=await call('/api/account/callback/google?code=invalid&state='+login.searchParams.get('state'),
    {cookie:started.headers.get('set-cookie').split(';')[0]},env);
  assert.equal(rejected.status,303);
  assert.equal(rejected.headers.get('location'),base+'/account/?error=login_failed');
 }finally{globalThis.fetch=originalFetch}
});
