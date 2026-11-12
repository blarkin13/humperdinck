import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleAccountPrivacy} from '../src/account-privacy.js';
globalThis.crypto ||= webcrypto;
const base='https://humperdinck.studio',account='a2649b57-cb1b-40b9-b2cf-18ff0e9c68b2';
const owner={id:account,kind:'web',created_at:Math.floor(Date.now()/1000)},desktop={id:account,kind:'desktop',created_at:Math.floor(Date.now()/1000)};
class DB{
 constructor(){this.requests=[];this.confirmations=[];this.calls=[];this.account={id:account,email:'owner@example.invalid',display_name:'Owner',created_at:42};}
 prepare(sql){this.calls.push(sql);const db=this;return {bind(...args){return {
  async first(){
   if(sql.startsWith('SELECT id,display_name,email,created_at'))return db.account?.id===args[0]?db.account:null;
   if(sql.startsWith('SELECT id,status,issued_at,max_devices'))return args[0]===account?{id:'license-1',user_id:account,status:'active',purchase_ref:'order-123'}:null;
   if(sql.includes('FROM auth_privacy_requests')&&sql.includes("id=? AND user_id=?"))return db.requests.find(x=>x.id===args[0]&&x.user_id===args[1]&&x.kind==='deletion'&&x.status==='pending')||null;
   if(sql.includes('FROM auth_privacy_requests')&&sql.includes('status=\'pending\''))return db.requests.find(x=>x.user_id===args[0]&&x.kind===args[1]&&x.status==='pending')||null;
   throw Error('Unexpected read '+sql);
  },
  async all(){
   if(sql.includes('FROM auth_identities'))return {results:[{provider:'google',created_at:40}]};
   if(sql.includes('FROM pro_devices'))return {results:[{installation_id:'random-uuid',label:'Owner Mac',activated_at:45}]};
   if(sql.includes('FROM auth_privacy_requests'))return {results:db.requests.filter(x=>x.user_id===args[0])};
   throw Error('Unexpected list '+sql);
  },
  async run(){
   if(sql.startsWith('INSERT INTO auth_deletion_confirmations')){
    const [request_id,user_id,policy_version,confirmed_at,expires_at]=args;
    const existing=db.confirmations.find(x=>x.request_id===request_id);
    if(existing&&existing.user_id!==user_id)return {meta:{changes:0}};
    if(existing)Object.assign(existing,{policy_version,confirmed_at,expires_at});
    else db.confirmations.push({request_id,user_id,policy_version,confirmed_at,expires_at});
    return {meta:{changes:1}};
   }
   if(sql.startsWith('INSERT OR IGNORE INTO auth_privacy_requests')){
    if(db.requests.some(x=>x.user_id===args[1]&&x.kind===args[2]&&x.status==='pending'))return {meta:{changes:0}};
    db.requests.push({id:args[0],user_id:args[1],kind:args[2],status:'pending',created_at:args[3]});
    return {meta:{changes:1}};
   }
   throw Error('Unexpected write '+sql);
  }
 }}}}
}
function invoke(db,path,{method='GET',data=null,origin=base,user=owner}={}){
 return handleAccountPrivacy(new Request(base+path,{method,
  headers:{Origin:origin,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined}),
  {AUTH_DB:db,ACCOUNT_DELETION_CONFIRMATION_ENABLED:db.ACCOUNT_DELETION_CONFIRMATION_ENABLED},{user,sameOrigin:req=>req.headers.get('Origin')===new URL(req.url).origin});
}
test('exports only authenticated owner account/license metadata, not secrets',async()=>{
 const db=new DB();
 assert.equal((await invoke(db,'/api/account/privacy/export',{user:desktop})).status,403);
 const r=await invoke(db,'/api/account/privacy/export');
 assert.equal(r.status,200);
 assert.match(r.headers.get('Content-Disposition'),/attachment/);
 const body=await r.json();
 assert.equal(body.account.email,'owner@example.invalid');
 assert.equal(body.pro_license.purchase_ref,'order-123');
 assert.equal(body.registered_devices.length,1);
 const raw=JSON.stringify(body);
 assert.doesNotMatch(raw,/token_hash|code_hash|google_client_secret/i);
 assert.equal(db.calls.some(sql=>/DELETE|UPDATE|INSERT/.test(sql)),false);
});
test('deletion request is owner-authenticated, CSRF protected and non-destructive',async()=>{
 const db=new DB();
 const body={kind:'deletion',confirmation:'REQUEST PRIVACY REVIEW',
  forfeitureAcknowledgment:'I UNDERSTAND ACCOUNT DELETION MAY FORFEIT PRO',
  offlineCertificateAcknowledged:true};
 assert.equal((await invoke(db,'/api/account/privacy/requests',{method:'POST',data:body,origin:'https://evil.invalid'})).status,403);
 assert.equal((await invoke(db,'/api/account/privacy/requests',{method:'POST',data:{kind:'deletion'}})).status,422);
 assert.equal((await invoke(db,'/api/account/privacy/requests',{method:'POST',data:{kind:'deletion',confirmation:'REQUEST PRIVACY REVIEW'}})).status,422);
 assert.equal((await invoke(db,'/api/account/privacy/requests',{method:'POST',data:{...body,offlineCertificateAcknowledged:false}})).status,422);
 assert.equal((await invoke(db,'/api/account/privacy/requests',{method:'POST',data:{...body,forfeitureAcknowledgment:'no'}})).status,422);
 assert.equal((await invoke(db,'/api/account/privacy/requests',{method:'POST',data:body,user:desktop})).status,403);
 const first=await invoke(db,'/api/account/privacy/requests',{method:'POST',data:body});
 assert.equal(first.status,202);
 assert.equal((await first.json()).status,'pending');
 assert.equal((await invoke(db,'/api/account/privacy/requests',{method:'POST',data:body})).status,200);
 assert.equal(db.requests.length,1);
 assert.equal(db.calls.some(sql=>/DELETE FROM auth_users|UPDATE pro_licenses/.test(sql)),false);
});

test('non-deletion privacy reviews do not demand Pro forfeiture',async()=>{
 const db=new DB();
 const r=await invoke(db,'/api/account/privacy/requests',{method:'POST',
  data:{kind:'access',confirmation:'REQUEST PRIVACY REVIEW'}});
 assert.equal(r.status,202);
 assert.equal(db.requests.length,1);
 assert.equal(db.calls.some(sql=>/DELETE FROM auth_users|UPDATE pro_licenses/.test(sql)),false);
});

test('final deletion consent is disabled by default and requires exact authenticated owner request',async()=>{
 const db=new DB();
 const review={kind:'deletion',confirmation:'REQUEST PRIVACY REVIEW',
  forfeitureAcknowledgment:'I UNDERSTAND ACCOUNT DELETION MAY FORFEIT PRO',
  offlineCertificateAcknowledged:true};
 const pending=await (await invoke(db,'/api/account/privacy/requests',{method:'POST',data:review})).json();
 const payload={requestId:pending.request_id,policyVersion:'deletion-draft-v1',
  confirmation:'DELETE MY HUMPERDINCK ACCOUNT',forfeitureAcknowledged:true,
  offlineCertificatesAcknowledged:true};
 const endpoint='/api/account/privacy/deletion/final-confirm';
 assert.equal((await invoke(db,endpoint,{method:'POST',data:payload})).status,404);
 db.ACCOUNT_DELETION_CONFIRMATION_ENABLED='true';
 assert.equal((await invoke(db,endpoint,{method:'POST',data:payload,user:desktop})).status,403);
 assert.equal((await invoke(db,endpoint,{method:'POST',data:payload,user:{...owner,created_at:100}})).status,403);
 assert.equal((await invoke(db,endpoint,{method:'POST',data:payload,origin:'https://invalid.example'})).status,403);
 assert.equal((await invoke(db,endpoint,{method:'POST',data:{...payload,confirmation:'OK'}})).status,422);
 assert.equal((await invoke(db,endpoint,{method:'POST',data:{...payload,offlineCertificatesAcknowledged:false}})).status,422);
 assert.equal((await invoke(db,endpoint,{method:'POST',data:{...payload,requestId:'e55cc1a7-a98d-45f8-85d6-4d2840180b12'}})).status,404);
 const accepted=await invoke(db,endpoint,{method:'POST',data:payload});
 assert.equal(accepted.status,202);
 assert.equal((await accepted.json()).status,'confirmed-for-review');
 assert.equal(db.confirmations.length,1);
 assert.equal(db.confirmations[0].user_id,account);
 assert.equal(db.confirmations[0].expires_at-db.confirmations[0].confirmed_at,600);
 assert.equal(db.calls.some(sql=>/DELETE FROM auth_users|UPDATE pro_licenses/.test(sql)),false);
});
