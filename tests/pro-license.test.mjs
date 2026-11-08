import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleProLicense} from '../src/pro-license.js';

globalThis.crypto ||= webcrypto;
const base='https://humperdinck.studio';
const user={id:'78ff4132-232d-4bd1-b9c9-7c4dce83dd41',kind:'web'};
const desktop={...user,kind:'desktop'};
const license={id:'b3e278b6-61a8-47dc-88c8-3d96fe32f724',user_id:user.id,
  status:'active',issued_at:1794100000,max_devices:10};
const encoder=new TextEncoder();
const decoded=val=>Uint8Array.from(atob(val.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-val.length%4)%4)),c=>c.charCodeAt(0));

class MockDB {
 constructor({paid=true}={}) {this.paid=paid;this.devices=[];}
 prepare(sql){
  const db=this;
  return {bind(...args){return {
   async first(){
    if(sql.startsWith('SELECT id,user_id,status,issued_at,max_devices FROM pro_licenses'))
     return db.paid&&args[0]===license.user_id?license:null;
    if(sql.startsWith('SELECT id,deactivated_at FROM pro_devices'))
     return db.devices.find(x=>x.license_id===args[0]&&x.installation_id===args[1])||null;
    throw Error('Unexpected SELECT: '+sql);
   },
   async all(){
    if(sql.startsWith('SELECT id,label,activated_at,last_seen_at,deactivated_at FROM pro_devices'))
     return {results:db.devices.filter(x=>x.license_id===args[0]).map(x=>({...x}))};
    throw Error('Unexpected list: '+sql);
   },
   async run(){
    if(sql.startsWith('UPDATE pro_devices SET label=')){
     const target=db.devices.find(x=>x.id===args[2]&&x.license_id===args[3]);
     if(target){target.label=args[0];target.last_seen_at=args[1]}
     return {meta:{changes:target?1:0}};
    }
    if(sql.startsWith('UPDATE pro_devices SET deactivated_at=NULL')){
     const target=db.devices.find(x=>x.id===args[3]&&x.license_id===args[4]&&x.deactivated_at!==null);
     if(!target||db.devices.filter(x=>x.deactivated_at===null).length>=args[6])
       return {meta:{changes:0}};
     target.label=args[0];target.activated_at=args[1];target.last_seen_at=args[2];
     target.deactivated_at=null;
     return {meta:{changes:1}};
    }
    if(sql.startsWith('INSERT INTO pro_devices')){
     const [id,licenseId,installationId,label,activatedAt,lastSeenAt,matchId,max]=args;
     if(matchId!==licenseId||db.devices.filter(x=>x.deactivated_at===null).length>=max)
       return {meta:{changes:0}};
     db.devices.push({id,license_id:licenseId,installation_id:installationId,label,
       activated_at:activatedAt,last_seen_at:lastSeenAt,deactivated_at:null});
     return {meta:{changes:1}};
    }
    if(sql.startsWith('UPDATE pro_devices SET deactivated_at=?')){
     const target=db.devices.find(x=>x.id===args[1]&&x.license_id===args[2]&&x.deactivated_at===null);
     if(target)target.deactivated_at=args[0];
     return {meta:{changes:target?1:0}};
    }
    throw Error('Unexpected mutation: '+sql);
   }
  }}};
 }
}
async function setup(){
 const pair=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
 const priv=await crypto.subtle.exportKey('pkcs8',pair.privateKey);
 return {key:pair.publicKey,env:{AUTH_DB:new MockDB(),
   PRO_LICENSE_ED25519_PRIVATE:Buffer.from(priv).toString('base64')}};
}
function req(path,{method='GET',data=null,origin='',bearer=false}={}){
 const h={'Content-Type':'application/json'};
 if(origin)h.Origin=origin;
 if(bearer)h.Authorization='Bearer '+('t'.repeat(43));
 return new Request(base+path,{method,headers:h,body:data===null?undefined:JSON.stringify(data)});
}
async function send(path,opts,env,who=user){
 return handleProLicense(req(path,opts),env,{session:async()=>who,
   sameOrigin:r=>r.headers.get('origin')===new URL(r.url).origin});
}
const createId=i=>'12345678-1234-4234-8234-'+String(i).padStart(12,'0');

test('anonymous and Free accounts cannot mint a grant',async()=>{
 const {env}=await setup();env.AUTH_DB.paid=false;
 assert.equal((await send('/api/account/license',{},env,null)).status,401);
 const overview=await (await send('/api/account/license',{},env)).json();
 assert.equal(overview.plan,'free');
 assert.equal(overview.checkout_available,false);
 assert.equal((await send('/api/account/license/backup',{},env)).status,404);
 assert.equal((await send('/api/account/license/activate',{
  method:'POST',bearer:true,data:{installation_id:createId(1),label:'Desktop'}},env,desktop)).status,403);
 assert.equal(env.AUTH_DB.devices.length,0);
});

test('signed perpetual backup uses verified Ed25519 key and cannot be silently modified',async()=>{
 const {env,key}=await setup();
 const backup=await (await send('/api/account/license/backup',{},env)).json();
 assert.equal(backup.portable,true);
 const [body,signature]=backup.license.split('.');
 const bytes=decoded(body);
 assert.ok(await crypto.subtle.verify('Ed25519',key,decoded(signature),bytes));
 const data=JSON.parse(new TextDecoder().decode(bytes));
 assert.equal(data.type,'humperdinck.pro.perpetual');
 assert.equal(data.expires_at,null);
 assert.equal(data.subject,user.id);
 assert.equal(data.license_id,license.id);
 assert.equal(data.features[0],'pro');
});

test('only desktop session can activate; ten slots enforced atomically and can be released',async()=>{
 const {env}=await setup();
 const one={installation_id:createId(1),label:'Primary PC'};
 assert.equal((await send('/api/account/license/activate',{method:'POST',data:one,origin:base},env)).status,403);
 assert.equal((await send('/api/account/license/activate',{method:'POST',data:one,bearer:true},env,desktop)).status,200);
 const again=await (await send('/api/account/license/activate',{method:'POST',data:one,bearer:true},env,desktop)).json();
 assert.equal(again.active_devices,1);
 for(let i=2;i<=10;i++){
  const r=await send('/api/account/license/activate',{method:'POST',data:{installation_id:createId(i),label:'Device '+i},bearer:true},env,desktop);
  assert.equal(r.status,200);
  if(i>=8)assert.match((await r.json()).warning,/limit/);
 }
 assert.equal((await send('/api/account/license/activate',{method:'POST',
  data:{installation_id:createId(11),label:'Extra'},bearer:true},env,desktop)).status,409);
 const status=await (await send('/api/account/license',{},env)).json();
 assert.equal(status.active_devices,10);
 assert.equal(status.device_limit,10);
 const first=status.devices.find(x=>x.label==='Primary PC');
 const path='/api/account/license/devices/'+first.id+'/deactivate';
 assert.equal((await send(path,{method:'POST',origin:'https://attacker.test'},env)).status,403);
 assert.equal((await send(path,{method:'POST',origin:base},env)).status,200);
 assert.equal((await send('/api/account/license/activate',{method:'POST',
  data:{installation_id:createId(11),label:'Extra'},bearer:true},env,desktop)).status,200);
 assert.equal((await send(path,{method:'POST',origin:base},env)).status,404);
});
