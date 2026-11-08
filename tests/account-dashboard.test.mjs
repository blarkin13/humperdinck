import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createLinkIntent,readLinkIntent,handleAccountDashboard} from '../src/account-dashboard.js';

globalThis.crypto ||= webcrypto;
const origin='https://humperdinck.studio';
const owner='a2649b57-cb1b-40b9-b2cf-18ff0e9c68b2';
const other='b2649b57-cb1b-40b9-b2cf-18ff0e9c68b2';
const web={id:owner,kind:'web',token_hash:'web-token-hash'};
const desktop={id:owner,kind:'desktop',token_hash:'desktop-token-hash'};
const install='a18192a1-5a81-4d4a-8c81-0aabd11bdef0';
const future=Math.floor(Date.now()/1000)+3600;

class MockDB {
 constructor(){
  this.users=[{id:owner,email:'owner@example.test',display_name:'Owner',created_at:1794100000}];
  this.sessions=[{token_hash:'web-token-hash',user_id:owner,kind:'web',expires_at:future},
   {token_hash:'desktop-token-hash',user_id:owner,kind:'desktop',expires_at:future},
   {token_hash:'legacy-token-hash',user_id:owner,kind:'desktop',expires_at:future}];
  this.identities=[{user_id:owner,provider:'google'}];
  this.connections=[];this.codes=[];this.links=[];this.purchase=null;
 }
 prepare(sql){
  const db=this;
  return {bind(...args){
   const stmt={
    async first(){
     if(sql.startsWith('SELECT id,status,issued_at,max_devices,provider,purchase_ref FROM pro_licenses'))
       return db.purchase?.user_id===args[0]?db.purchase:null;
     if(sql.startsWith('SELECT COUNT(*) AS count FROM auth_sessions s LEFT JOIN'))
       return {count:db.sessions.filter(s=>s.user_id===args[0]&&s.kind==='desktop'&&s.expires_at>args[1]&&!db.connections.some(c=>c.token_hash===s.token_hash)).length};
     if(sql.startsWith('SELECT COUNT(*) AS count FROM auth_recovery_codes'))
       return {count:db.codes.filter(c=>c.user_id===args[0]).length};
     if(sql.startsWith('SELECT id,display_name,email,created_at FROM auth_users'))
       return db.users.find(x=>x.id===args[0])||null;
     if(sql.startsWith('SELECT id FROM auth_users WHERE id='))
       return db.users.find(x=>x.id===args[0])||null;
     if(sql.startsWith('SELECT id FROM auth_connected_desktops'))
       return db.connections.find(c=>c.token_hash===args[0])||null;
     if(sql.startsWith('SELECT user_id,session_hash FROM auth_link_intents'))
       return db.links.find(l=>l.state_hash===args[0]&&l.expires_at>args[1])||null;
     if(sql.startsWith('SELECT token_hash FROM auth_sessions'))
       return db.sessions.find(s=>s.token_hash===args[0]&&s.user_id===args[1]&&s.kind==='web'&&s.expires_at>args[2])||null;
     throw Error('Unexpected first SQL '+sql);
    },
    async all(){
     if(sql.startsWith('SELECT provider FROM auth_identities'))
       return {results:db.identities.filter(x=>x.user_id===args[0])};
     if(sql.startsWith('SELECT c.id,c.label,c.connected_at'))
       return {results:db.connections.filter(x=>x.user_id===args[0]&&db.sessions.some(s=>s.token_hash===x.token_hash&&s.expires_at>args[1])).map(x=>({...x,expires_at:future}))};
     throw Error('Unexpected all SQL '+sql);
    },
    async run(){
     if(sql.startsWith('INSERT INTO auth_connected_desktops')){
      const c={id:args[0],user_id:args[1],token_hash:args[2],installation_id:args[3],
       label:args[4],connected_at:args[5],last_seen_at:args[6]};
      const i=db.connections.findIndex(x=>x.token_hash===args[2]);
      if(i<0)db.connections.push(c);else db.connections[i]={...db.connections[i],...c,id:db.connections[i].id};
      return {meta:{changes:1}};
     }
     if(sql.startsWith('DELETE FROM auth_recovery_codes WHERE user_id=? AND code_hash=?')){
      const i=db.codes.findIndex(x=>x.user_id===args[0]&&x.code_hash===args[1]);
      if(i<0)return {meta:{changes:0}};
      db.codes.splice(i,1);return {meta:{changes:1}};
     }
     if(sql.startsWith('DELETE FROM auth_recovery_codes WHERE user_id=?')){
      db.codes=db.codes.filter(x=>x.user_id!==args[0]);return {meta:{changes:8}};
     }
     if(sql.startsWith('INSERT INTO auth_recovery_codes')){
      db.codes.push({user_id:args[0],code_hash:args[1],created_at:args[2]});return {meta:{changes:1}};
     }
     if(sql.startsWith("DELETE FROM auth_sessions WHERE user_id=? AND kind='desktop'")){
      const removed=db.sessions.filter(s=>s.user_id===args[0]&&s.kind==='desktop');
      db.sessions=db.sessions.filter(s=>!removed.includes(s));
      db.connections=db.connections.filter(c=>!removed.some(s=>s.token_hash===c.token_hash));
      return {meta:{changes:removed.length}};
     }
     if(sql.startsWith('DELETE FROM auth_sessions WHERE token_hash IN')){
      const connection=db.connections.find(c=>c.id===args[0]&&c.user_id===args[1]);
      const removed=connection&&args[1]===args[2]&&db.sessions.some(s=>s.token_hash===connection.token_hash&&s.kind==='desktop');
      if(removed){
       db.sessions=db.sessions.filter(s=>s.token_hash!==connection.token_hash);
       db.connections=db.connections.filter(c=>c.id!==connection.id);
      }
      return {meta:{changes:removed?1:0}};
     }
     if(sql.startsWith('DELETE FROM auth_link_intents WHERE expires_at <')){
      db.links=db.links.filter(x=>x.expires_at>=args[0]);return {meta:{changes:0}};
     }
     if(sql.startsWith('INSERT INTO auth_link_intents')){
      db.links.push({state_hash:args[0],user_id:args[1],session_hash:args[2],expires_at:args[3]});
      return {meta:{changes:1}};
     }
     throw Error('Unexpected mutation SQL '+sql);
    }
   };
   return stmt;
  }};
 }
 async batch(stmts){for(const s of stmts)await s.run();return [];}
}
function makeRequest(path,{method='GET',data,originHeader='',bearer=false}={}){
 return new Request(origin+path,{method,
  headers:{...(originHeader?{'Origin':originHeader}:{}),
   ...(bearer?{'Authorization':'Bearer '+('x'.repeat(43))}:{}),
   ...(method!=='GET'?{'Content-Type':'application/json'}:{})},
  ...(method!=='GET'?{body:JSON.stringify(data||{})}:{})});
}
function setup(db=new MockDB()){
 const env={AUTH_DB:db,AUTH_RATE_SECRET:'very-secret-test-pepper'};
 let rateHits=0;let issued=[];
 const context={session:async(request)=>request.headers.get('X-Untrusted-Test-Anonymous')?null:
    request.headers.has('Authorization')?desktop:web,
   sameOrigin:request=>request.headers.get('Origin')===new URL(request.url).origin,
   saveSession:async(_env,id,kind)=>{issued.push({id,kind});return {token:'r'.repeat(43)}},
   cookie:(name,value,age)=>name+'='+value+'; Secure; HttpOnly; Max-Age='+age,
   cookieName:'__Host-humperdinck_session',
   rateLimit:async()=>{rateHits++;return rateHits<=6}};
 return {env,db,context,issued};
}
async function send(path,opts,parts){
 return handleAccountDashboard(makeRequest(path,opts),parts.env,parts.context);
}

test('dashboard shows honest Free purchase status and never creates license grants',async()=>{
 const x=setup();
 const r=await send('/api/account/dashboard',{},x);
 assert.equal(r.status,200);
 const d=await r.json();
 assert.equal(d.purchase.edition,'free');
 assert.equal(d.purchase.status,'none');
 assert.equal(d.purchase.checkout_available,false);
 assert.equal(d.purchase.receipt_available,false);
 assert.deepEqual(d.account.providers,['google']);
 assert.equal(d.older_desktop_sessions,2);
 assert.equal(d.connected_desktops.length,0);
 assert.equal(x.db.codes.length,0);
 x.db.purchase={user_id:owner,status:'active',issued_at:1794000000,provider:'example',purchase_ref:'receipt-1'};
 const pro=await (await send('/api/account/dashboard',{},x)).json();
 assert.equal(pro.purchase.lifetime,true);
 assert.equal(pro.purchase.provider,'example');
});

test('new connected desktop is visible and the owner can revoke it or every legacy session',async()=>{
 const x=setup();
 let r=await send('/api/account/dashboard/connections/register',{
   method:'POST',originHeader:origin,data:{installation_id:install,label:'Mac · abc123'}},x);
 assert.equal(r.status,403,'Browser session cannot self-register as a desktop');
 r=await send('/api/account/dashboard/connections/register',{
   method:'POST',bearer:true,data:{installation_id:install,label:'Mac · abc123'}},x);
 assert.equal(r.status,200);
 assert.equal(x.db.connections.length,1);
 let d=await (await send('/api/account/dashboard',{},x)).json();
 assert.equal(d.connected_desktops.length,1);
 assert.equal(d.older_desktop_sessions,1);
 const id=d.connected_desktops[0].id;
 const path='/api/account/dashboard/connections/'+id+'/revoke';
 assert.equal((await send(path,{method:'POST',originHeader:'https://evil.invalid'},x)).status,403);
 assert.equal((await send(path,{method:'POST',originHeader:origin},x)).status,200);
 assert.equal((await send(path,{method:'POST',originHeader:origin},x)).status,404);
 assert.equal(x.db.sessions.some(s=>s.token_hash==='desktop-token-hash'),false);
 assert.equal(x.db.sessions.some(s=>s.token_hash==='web-token-hash'),true);
 const all=await (await send('/api/account/dashboard/connections/revoke-all',{method:'POST',originHeader:origin},x)).json();
 assert.equal(all.revoked,1);
 assert.equal(x.db.sessions.length,1);
});

test('recovery kit stores only hashes, old codes are invalidated, and codes work once',async()=>{
 const x=setup();
 assert.equal((await send('/api/account/dashboard/recovery/codes',{method:'POST',originHeader:'https://evil.invalid'},x)).status,403);
 const issued=await send('/api/account/dashboard/recovery/codes',{method:'POST',originHeader:origin},x);
 assert.equal(issued.status,200);
 const kit=await issued.json();
 assert.equal(kit.codes.length,8);
 assert.ok(kit.codes.every(c=>/^[A-Za-z0-9_-]{32}$/.test(c)));
 assert.equal(x.db.codes.length,8);
 assert.ok(x.db.codes.every(x=>!kit.codes.includes(x.code_hash)));
 const first=kit.codes[0];
 const second=await (await send('/api/account/dashboard/recovery/codes',{method:'POST',originHeader:origin},x)).json();
 assert.equal(x.db.codes.length,8);
 assert.equal((await send('/api/account/recovery/redeem',{method:'POST',originHeader:origin,data:{account_id:owner,code:first}},x)).status,401);
 assert.equal((await send('/api/account/recovery/redeem',{method:'POST',originHeader:'https://evil.invalid',data:{account_id:owner,code:second.codes[0]}},x)).status,403);
 const redeem=await send('/api/account/recovery/redeem',{method:'POST',originHeader:origin,data:{account_id:owner,code:second.codes[0]}},x);
 assert.equal(redeem.status,200);
 assert.match(redeem.headers.get('set-cookie'),/__Host-humperdinck_session=/);
 assert.equal(x.issued[0].id,owner);
 assert.equal(x.issued[0].kind,'web');
 assert.equal((await send('/api/account/recovery/redeem',{method:'POST',originHeader:origin,data:{account_id:owner,code:second.codes[0]}},x)).status,401);
 const d=await (await send('/api/account/dashboard',{},x)).json();
 assert.equal(d.recovery.codes_remaining,7);
});

test('provider linking must be tied to the authenticated initiating web session',async()=>{
 const x=setup();
 await createLinkIntent(x.env,'hash-123',web);
 assert.equal(await readLinkIntent(x.env,'hash-123'),owner);
 x.db.sessions=x.db.sessions.filter(s=>s.token_hash!=='web-token-hash');
 await assert.rejects(readLinkIntent(x.env,'hash-123'),/expired/);
 await assert.rejects(readLinkIntent(x.env,'unknown'),/expired/);
});

test('recovery cannot be used without codes or with another account ID',async()=>{
 const x=setup();
 const result=await send('/api/account/recovery/redeem',{method:'POST',originHeader:origin,data:{account_id:other,code:'x'.repeat(32)}},x);
 assert.equal(result.status,401);
 assert.equal(x.issued.length,0);
});
