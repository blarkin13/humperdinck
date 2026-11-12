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
    if(sql.startsWith('SELECT token_hash FROM auth_sessions')){
     const found=database.sessions.get(args[0]);
     return found&&found.user_id===args[1]&&found.kind==='web'&&found.expires_at>args[2]?{token_hash:args[0]}:null;
    }
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
 assert.equal((await startAdult()).status,503);
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
 constructor(){super();this.oauthFlows=new Map();this.identities=new Map();this.linkIntents=new Map();this.ageAttestations=new Map();}
 async batch(stmts){
  // Fake D1 transaction: execute statements in order for registration test.
  return Promise.all(stmts.map(stmt=>stmt.run()));
 }
 prepare(sql){
  const db=this;
  if(sql.includes('auth_flows')||sql.includes('auth_identities')||sql.includes('auth_age_attestations')||sql.includes('auth_link_intents')||sql.startsWith('INSERT INTO auth_users')||sql.startsWith('UPDATE auth_users')){
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
     if(sql.includes('SELECT user_id,session_hash FROM auth_link_intents')){
      const found=db.linkIntents.get(args[0]);
      return found&&found.expires_at>args[1]?found:null;
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
     if(sql.startsWith('INSERT INTO auth_age_attestations')){
      db.ageAttestations.set(args[0],{policy_version:args[1],attested_at:args[2]});
      return {meta:{changes:1}};
     }
     if(sql.startsWith('DELETE FROM auth_link_intents WHERE expires_at')){
      for(const [key,found] of db.linkIntents)if(found.expires_at<args[0])db.linkIntents.delete(key);
      return {meta:{changes:0}};
     }
     if(sql.startsWith('DELETE FROM auth_link_intents WHERE state_hash')){
      return {meta:{changes:db.linkIntents.delete(args[0])?1:0}};
     }
     if(sql.startsWith('INSERT INTO auth_link_intents')){
      db.linkIntents.set(args[0],{state_hash:args[0],user_id:args[1],session_hash:args[2],expires_at:args[3]});
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
 const startAdult=async()=>{
  const consent=await call('/api/account/eligibility/confirm',{
   method:'POST',origin:base,data:{age18:true,policy_version:'age18-v1'}},env);
  assert.equal(consent.status,200);
  const cookie=consent.headers.get('set-cookie').split(';')[0];
  return call('/api/account/start/google',{cookie},env);
 };
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
  let started=await startAdult();
  assert.equal(started.status,303);
  let login=new URL(started.headers.get('location'));
  expectedNonce=login.searchParams.get('nonce');
  const state=login.searchParams.get('state');
  const csrfCookie=started.headers.get('set-cookie').split(';')[0];
  assert.match(csrfCookie,/^__Host-humperdinck_oauth_[A-Za-z0-9_-]{16}=/);
  assert.match(started.headers.get('set-cookie'),/SameSite=Lax/);
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
  assert.equal(db.ageAttestations.get(account.user.id)?.policy_version,'age18-v1');
  const replay=await call('/api/account/callback/google?code=once&state='+state,{cookie:csrfCookie},env);
  assert.equal(replay.status,303);
  assert.equal(replay.headers.get('location'),base+'/account/?error=signin_expired');
  assert.match(callback.headers.get('set-cookie'),/Max-Age=0/);

  // Starting a second login must not invalidate a still-pending first login.
  const firstPending=await startAdult();
  const secondPending=await startAdult();
  const firstURL=new URL(firstPending.headers.get('location'));
  const secondURL=new URL(secondPending.headers.get('location'));
  const firstCookie=firstPending.headers.get('set-cookie').split(';')[0];
  const secondCookie=secondPending.headers.get('set-cookie').split(';')[0];
  assert.notEqual(firstCookie.split('=')[0],secondCookie.split('=')[0]);
  expectedNonce=firstURL.searchParams.get('nonce');
  claimModifier=null;
  const firstResult=await call('/api/account/callback/google?code=parallel-one&state='+firstURL.searchParams.get('state'),
    {cookie:firstCookie+'; '+secondCookie},env);
  assert.equal(firstResult.status,303);
  expectedNonce=secondURL.searchParams.get('nonce');
  const secondResult=await call('/api/account/callback/google?code=parallel-two&state='+secondURL.searchParams.get('state'),
    {cookie:secondCookie},env);
  assert.equal(secondResult.status,303);

  // Invalid/missing cookie should render an account retry, never raw JSON.
  const expiredStart=await startAdult();
  const expiredState=new URL(expiredStart.headers.get('location')).searchParams.get('state');
  const expiredResponse=await call('/api/account/callback/google?code=unauthorized&state='+expiredState,{},env);
  assert.equal(expiredResponse.status,303);
  assert.equal(expiredResponse.headers.get('location'),base+'/account/?error=signin_expired');

  // A www start should redirect before setting host-only state cookies.
  const wwwStart=await handleAccount(new Request('https://www.humperdinck.studio/api/account/start/google?return_to=%2Faccount%2F'),env);
  assert.equal(wwwStart.status,303);
  assert.equal(wwwStart.headers.get('location'),base+'/api/account/start/google?return_to=%2Faccount%2F');
  assert.equal(wwwStart.headers.has('set-cookie'),false);

  // An authenticated account owner may link a second Google identity, even
  // after recovering the account from a one-time code, without merging users.
  assert.equal((await call('/api/account/link/start/google',{},env)).status,401);
  let linked=await call('/api/account/link/start/google',{cookie:sessionCookie},env);
  assert.equal(linked.status,303);
  let linkLogin=new URL(linked.headers.get('location'));
  assert.equal(linkLogin.searchParams.get('prompt'),'select_account');
  expectedNonce=linkLogin.searchParams.get('nonce');
  claimModifier=payload=>{payload.sub='replacement-google-account';payload.email='new@example.test'};
  const linkCallback=await call('/api/account/callback/google?code=link&state='+linkLogin.searchParams.get('state'),
    {cookie:linked.headers.get('set-cookie').split(';')[0]},env);
  assert.equal(linkCallback.status,303);
  assert.equal(db.identities.get('google|replacement-google-account'),account.user.id);
  assert.equal(db.users.size,1,'Linking does not create another customer record');

  // Never merge into a separate customer even if the Google account is valid.
  db.identities.set('google|already-used-elsewhere','someone-else');
  linked=await call('/api/account/link/start/google',{cookie:sessionCookie},env);
  linkLogin=new URL(linked.headers.get('location'));
  expectedNonce=linkLogin.searchParams.get('nonce');
  claimModifier=payload=>{payload.sub='already-used-elsewhere'};
  const blocked=await call('/api/account/callback/google?code=conflict&state='+linkLogin.searchParams.get('state'),
    {cookie:linked.headers.get('set-cookie').split(';')[0]},env);
  assert.equal(blocked.status,303);
  assert.equal(blocked.headers.get('location'),base+'/account/?error=login_failed');
  assert.equal(db.identities.get('google|already-used-elsewhere'),'someone-else');

  started=await startAdult();
  login=new URL(started.headers.get('location'));
  expectedNonce=login.searchParams.get('nonce');
  claimModifier=payload=>{payload.aud='incorrect-audience'};
  const rejected=await call('/api/account/callback/google?code=invalid&state='+login.searchParams.get('state'),
    {cookie:started.headers.get('set-cookie').split(';')[0]},env);
  assert.equal(rejected.status,303);
  assert.equal(rejected.headers.get('location'),base+'/account/?error=login_failed');
 }finally{globalThis.fetch=originalFetch}
});

test('device pairing rate limit atomically caps burst requests at ten per IP',async()=>{
 class CountingRateDB extends MockDB {
  prepare(sql){
   if(sql.startsWith('DELETE FROM auth_rate')){
    return {bind(){return {async run(){return {meta:{changes:0}}}}}};
   }
   if(sql.startsWith('INSERT INTO auth_rate')){
    const db=this;
    return {bind(...args){return {async run(){
     const [bucket,created_at,match,limit]=args;
     assert.equal(bucket,match);
     const used=db.rate.filter(x=>x[0]===bucket).length;
     if(used>=limit)return {meta:{changes:0}};
     db.rate.push([bucket,created_at]);
     return {meta:{changes:1}};
    }}}};
   }
   return super.prepare(sql);
  }
 }
 const db=new CountingRateDB(),env={AUTH_DB:db,
  AUTH_RATE_SECRET:'test-only-pepper',
  GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret'};
 const make=()=>call('/api/account/device/begin',{method:'POST',
   data:{challenge:'z'.repeat(43)}},env);
 const results=await Promise.all(Array.from({length:20},make));
 assert.equal(results.filter(x=>x.status===200).length,10);
 assert.equal(results.filter(x=>x.status===429).length,10);
 assert.equal(db.rate.length,10);
});

test('adult confirmation is server checked and new registrations are fail closed',async()=>{
 const env={AUTH_DB:new OAuthDB(),AUTH_RATE_SECRET:'test-key',
   GOOGLE_CLIENT_ID:'google',GOOGLE_CLIENT_SECRET:'secret'};
 assert.equal((await call('/api/account/eligibility/confirm',{
   method:'POST',origin:'https://untrusted.example',data:{age18:true,policy_version:'age18-v1'}},env)).status,403);
 assert.equal((await call('/api/account/eligibility/confirm',{
   method:'POST',origin:base,data:{age18:false,policy_version:'age18-v1'}},env)).status,422);
 assert.equal((await call('/api/account/eligibility/confirm',{
   method:'POST',origin:base,data:{age18:true,policy_version:'age18-v0'}},env)).status,422);
 const without=await call('/api/account/start/google',{},env);
 assert.equal(without.status,303);
 const state= new URL(without.headers.get('location')).searchParams.get('state');
 const flow=env.AUTH_DB.oauthFlows.get(sha(state));
 assert.equal(flow.return_path,'/account/');
 const valid=await call('/api/account/eligibility/confirm',{
   method:'POST',origin:base,data:{age18:true,policy_version:'age18-v1'}},env);
 const proof=valid.headers.get('set-cookie').split(';')[0];
 const began=await call('/api/account/start/google',{cookie:proof},env);
 const approvedState=new URL(began.headers.get('location')).searchParams.get('state');
 assert.match(env.AUTH_DB.oauthFlows.get(sha(approvedState)).return_path,/^__age18_v1__\\|/);
 const tampered=await call('/api/account/start/google',{cookie:proof.slice(0,-1)+'x'},env);
 const tamperedState=new URL(tampered.headers.get('location')).searchParams.get('state');
 assert.equal(env.AUTH_DB.oauthFlows.get(sha(tamperedState)).return_path,'/account/');
});
