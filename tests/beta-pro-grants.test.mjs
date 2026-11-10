import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleProLicense} from '../src/pro-license.js';

globalThis.crypto ||= webcrypto;
const home='https://humperdinck.studio';
const userId='78ff4132-232d-4bd1-b9c9-7c4dce83dd41';
const grantId='b3e278b6-61a8-47dc-88c8-3d96fe32f724';
const install='83e278b6-61a8-47dc-88c8-3d96fe32f724';
const clock=Math.floor(Date.now()/1000);
const beta={id:grantId,user_id:userId,issued_at:clock-60,expires_at:clock+30*86400-60};
async function env({enabled=true,expired=false,paid=false}={}){
 const pair=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
 const key=Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64');
 return {BETA_PRO_ENABLED:enabled?'1':'0',PRO_LICENSE_ED25519_PRIVATE:key,
  AUTH_DB:{prepare(sql){return {bind(...args){return {
   async first(){
    if(sql.includes('FROM pro_licenses'))return paid?{id:grantId,user_id:userId,status:'active',issued_at:clock-30,max_devices:10}:null;
    if(sql.includes('FROM beta_pro_grants'))return enabled&&!expired?beta:null;
    throw Error('Unexpected query: '+sql);
   }
  }}};}}};
}
const request=(path,method='GET')=>new Request(home+path,{method,
 headers:{Origin:home,...(method==='POST'?{Authorization:'Bearer '+'x'.repeat(43),
  'Content-Type':'application/json'}:{})},
 body:method==='POST'?JSON.stringify({installation_id:install,label:'Test device'}):undefined});
const send=(path,env,kind='web',method='GET')=>
 handleProLicense(request(path,method),env,{session:async()=>({id:userId,kind}),sameOrigin:()=>true});
const decode=token=>JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString('utf8'));

test('30-day beta appears as temporary, not perpetual or portable',async()=>{
 const e=await env();
 const r=await send('/api/account/license',e);
 assert.equal(r.status,200);const data=await r.json();
 assert.equal(data.source,'beta');assert.equal(data.plan,'pro');
 assert.equal(data.lifetime,false);assert.equal(data.license.backup_available,false);
 assert.equal(data.expires_at,beta.expires_at);
 const backup=await send('/api/account/license/backup',e);
 assert.equal(backup.status,404);
});
test('beta desktop activation has expiry, installation binding and never perpetual type',async()=>{
 const e=await env();
 const r=await send('/api/account/license/activate',e,'desktop','POST');
 assert.equal(r.status,200);const result=await r.json();
 assert.equal(result.beta,true);
 assert.equal(result.lifetime,false);
 const payload=decode(result.license);
 assert.equal(payload.type,'humperdinck.pro.beta');
 assert.equal(payload.transfer,'single-installation-expiring');
 assert.equal(payload.expires_at,beta.expires_at);
 assert.equal(payload.installation_id,install);
 assert.notEqual(payload.type,'humperdinck.pro.perpetual');
});
test('expired or disabled beta returns Free and cannot activate',async()=>{
 for(const params of [{enabled:false},{expired:true}]){
  const e=await env(params);
  const overview=await (await send('/api/account/license',e)).json();
  assert.equal(overview.plan,'free');
  assert.equal((await send('/api/account/license/activate',e,'desktop','POST')).status,403);
 }
});
test('beta signing cannot be triggered from web session',async()=>{
 const e=await env();
 assert.equal((await send('/api/account/license/activate',e,'web','POST')).status,403);
});
