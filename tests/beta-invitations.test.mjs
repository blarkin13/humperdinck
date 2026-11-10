import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleBetaInvitations} from '../src/beta-invitations.js';

globalThis.crypto ||= webcrypto;
const base='https://humperdinck.studio';
const owner='8b9d2ab3-cdbb-44d5-852e-7b99523b2a01';
const tester='31d283a4-50a4-4a61-845e-030ccc3ad3a7';
const email='tester@example.test';
function setup(){
 const calls=[],state={invitation:null,grant:null,license:null,devices:0};
 const db={prepare(sql){
  return {bind(...args){calls.push({sql,args});return {
   first:async()=>{
    if(sql.includes('SELECT id FROM beta_invitations WHERE email=? AND accepted_at IS NULL')){
     const row=state.invitation;
     return row&&!row.revoked_at&&!row.accepted_at?row:null;
    }
    if(sql.includes("FROM auth_users u JOIN auth_identities i"))return {id:tester};
    if(sql.includes("FROM pro_licenses WHERE user_id=?"))return state.license?{id:'paid'}:null;
    if(sql.includes("SELECT COUNT(*) AS count FROM pro_devices"))return {count:state.devices};
    if(sql.includes("FROM pro_licenses p JOIN auth_users u"))return state.license;
    return null;
   },
   run:async()=>{
    if(sql.startsWith('INSERT INTO beta_invitations'))state.invitation={id:args[0],email:args[1],expires_at:args[3]};
    if(sql.startsWith('INSERT INTO beta_pro_grants'))state.grant={id:args[0],expires_at:args[3]};
    if(sql.startsWith('UPDATE beta_invitations SET accepted_at'))state.invitation.accepted_at=args[0];
    if(sql.startsWith('UPDATE pro_licenses SET status'))state.license=null;
    return {meta:{changes:1}};
   },
   all:async()=>({results:[]})
  }}},all:async()=>({results:[]})};
 }};
 const env={AUTH_DB:db,BETA_PRO_ENABLED:'1',BETA_FEEDBACK_ENABLED:'1',ANALYTICS_OWNER_ACCOUNT_ID:owner};
 return {env,calls,state};
}
const request=(path,method='GET',data,origin=base)=>new Request(base+path,{
 method,headers:method==='GET'?{}:{Origin:origin,'Content-Type':'application/json'},
 ...(data===undefined?{}:{body:JSON.stringify(data)})
});
const send=(path,x,{method='GET',user=owner,mail='owner@example.test',data,origin=base}={})=>
 handleBetaInvitations(request(path,method,data,origin),x.env,{
  session:async()=>({id:user,kind:'web',email:mail})
 });
test('invitation owner can create pre-login email invitation without creating Pro grant',async()=>{
 const x=setup(),r=await send('/api/beta/admin/invitations',x,{method:'POST',data:{email}});
 assert.equal(r.status,201);
 const body=await r.json();
 assert.equal(body.email,email);
 assert.equal(body.mail_sent,false);
 assert.equal(body.expires_at-x.calls.find(x=>x.sql.startsWith('INSERT INTO beta_invitations')).args[2],14*86400);
 assert.match(body.invitation_url,/\/beta\/\?invited=1/);
 assert.equal(x.state.grant,null);
});
test('unprivileged user cannot list, send, or revoke invitations',async()=>{
 const x=setup();
 for(const method of ['GET','POST']){
  assert.equal((await send('/api/beta/admin/invitations',x,{method,user:tester,mail:email,data:{email}})).status,404);
 }
 assert.equal(x.calls.length,0);
});
test('invalid origin rejected and unsigned path cannot activate',async()=>{
 const x=setup();
 assert.equal((await send('/api/beta/admin/invitations',x,{method:'POST',data:{email},origin:'https://evil.example'})).status,403);
 assert.equal((await send('/api/beta/invitations/claim',x,{method:'POST',user:tester,mail:email})).status,404);
});
test('invited Google account can claim a 30-day grant exactly once',async()=>{
 const x=setup();
 await send('/api/beta/admin/invitations',x,{method:'POST',data:{email}});
 const status=await (await send('/api/beta/invitations/status',x,{user:tester,mail:email})).json();
 assert.equal(status.invited,true);
 const r=await send('/api/beta/invitations/claim',x,{method:'POST',user:tester,mail:email});
 assert.equal(r.status,201);
 const data=await r.json();
 assert.equal(data.expires_at-x.calls.find(c=>c.sql.startsWith('INSERT INTO beta_pro_grants')).args[2],30*86400);
 assert.equal(x.state.invitation.accepted_at>0,true);
 assert.equal((await send('/api/beta/invitations/claim',x,{method:'POST',user:tester,mail:email})).status,404);
});
test('existing paid test account is refused beta claim until test entitlement revoked',async()=>{
 const x=setup();
 await send('/api/beta/admin/invitations',x,{method:'POST',data:{email}});
 x.state.license={id:'paid',user_id:tester};
 const r=await send('/api/beta/invitations/claim',x,{method:'POST',user:tester,mail:email});
 assert.equal(r.status,409);assert.equal(x.state.grant,null);
});
test('only owner can revoke an active test license, with exact confirmation',async()=>{
 const x=setup();x.state.license={id:'paid',user_id:tester};
 const path='/api/beta/admin/test-license/revoke';
 let r=await send(path,x,{method:'POST',user:tester,mail:email,data:{email,confirm:'REVOKE TEST LICENSE'}});
 assert.equal(r.status,404);assert.ok(x.state.license);
 r=await send(path,x,{method:'POST',data:{email,confirm:'wrong'}});
 assert.equal(r.status,400);assert.ok(x.state.license);
 r=await send(path,x,{method:'POST',data:{email,confirm:'REVOKE TEST LICENSE'}});
 assert.equal(r.status,200);const d=await r.json();assert.equal(d.purchase_history_preserved,true);assert.equal(x.state.license,null);
 assert.ok(x.calls.some(c=>c.sql.includes("provider='lemonsqueezy-test'")));
});
test('test license with device registrations cannot be revoked',async()=>{
 const x=setup();x.state.license={id:'paid',user_id:tester};x.state.devices=1;
 const r=await send('/api/beta/admin/test-license/revoke',x,{method:'POST',
  data:{email,confirm:'REVOKE TEST LICENSE'}});
 assert.equal(r.status,409);assert.ok(x.state.license);
});
