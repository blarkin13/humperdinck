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
    if(sql.startsWith('SELECT id FROM pro_devices WHERE license_id=? AND installation_id=? AND deactivated_at IS NULL'))
     return db.devices.find(x=>x.license_id===args[0]&&x.installation_id===args[1]&&x.deactivated_at===null)||null;
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
    if(sql.startsWith('UPDATE pro_devices SET deactivated_at=NULL WHERE id=?')){
     const target=db.devices.find(x=>x.id===args[0]&&x.license_id===args[1]);
     if(target)target.deactivated_at=null;
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

const HASH='a'.repeat(64);
const payloadOf=token=>JSON.parse(new TextDecoder().decode(decoded(token.split('.')[0])));
async function activate(env,extra={}){
 return send('/api/account/license/activate',{method:'POST',bearer:true,
   data:{installation_id:createId(500),label:'PC',device_hash:HASH,...extra}},env,desktop);
}

test('activation signs a license bound to the account and this computer',async()=>{
 const {env,key}=await setup();
 const result=await (await activate(env)).json();
 const [body,signature]=result.license.split('.');
 const bytes=decoded(body);
 assert.ok(await crypto.subtle.verify('Ed25519',key,decoded(signature),bytes));
 const data=JSON.parse(new TextDecoder().decode(bytes));
 assert.equal(data.version,2);
 assert.equal(data.type,'humperdinck.pro.perpetual');
 assert.equal(data.transfer,'account-device-bound');
 assert.equal(data.device_hash,HASH);
 assert.equal(data.expires_at,null);
 assert.equal(data.subject,user.id);
 assert.equal(data.license_id,license.id);
 assert.deepEqual(data.features,['pro']);
});

test('older desktop apps without a computer id still get the legacy certificate',async()=>{
 const {env}=await setup();
 const r=await send('/api/account/license/activate',{method:'POST',bearer:true,
   data:{installation_id:createId(501),label:'Old app'}},env,desktop);
 const data=payloadOf((await r.json()).license);
 assert.equal(data.version,1);
 assert.equal(data.transfer,'portable-offline-backup');
});

test('malformed computer ids are refused and portable license downloads are gone',async()=>{
 const {env}=await setup();
 for(const device_hash of ['A'.repeat(64),'a'.repeat(63),'',123])
   assert.equal((await activate(env,{device_hash})).status,400);
 assert.equal(env.AUTH_DB.devices.length,0);
 assert.equal((await send('/api/account/license/backup',{},env)).status,410);
 const overview=await (await send('/api/account/license',{},env)).json();
 assert.equal(overview.license.backup_available,false);
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
  if(i>=8)assert.match((await r.json()).warning,/(?:limit|slots)/);
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

test('Pro activation rejects malformed identifiers, labels and unauthorized clients',async()=>{
 const {env}=await setup();
 for(const data of [
   {installation_id:'not-a-uuid',label:'Desktop'},
   {installation_id:createId(41),label:''},
   {installation_id:createId(41),label:' '.repeat(10)},
   {installation_id:createId(41),label:'X'.repeat(81)},
   {installation_id:createId(41)},
 ]){
   const denied=await send('/api/account/license/activate',{method:'POST',data,bearer:true},env,desktop);
   assert.equal(denied.status,400);
 }
 assert.equal((await send('/api/account/license/activate',{method:'POST',
   data:{installation_id:createId(1),label:'PC'}},env,desktop)).status,403);
 assert.equal(env.AUTH_DB.devices.length,0);
});

test('missing signing key cannot create an online registration',async()=>{
 const {env}=await setup();
 delete env.PRO_LICENSE_ED25519_PRIVATE;
 const data={installation_id:createId(90),label:'PC'};
 assert.equal((await send('/api/account/license/activate',{method:'POST',
   data,bearer:true},env,desktop)).status,503);
 assert.equal(env.AUTH_DB.devices.length,0);
});

test('parallel online registrations never create an eleventh slot and a released slot can be reused',async()=>{
 const {env}=await setup();
 for(let i=1;i<=9;i++){
   const res=await send('/api/account/license/activate',{method:'POST',
     bearer:true,data:{installation_id:createId(i),label:'PC '+i}},env,desktop);
   assert.equal(res.status,200);
 }
 const attempts=await Promise.all(Array.from({length:10},(_,j)=>
   send('/api/account/license/activate',{method:'POST',
     bearer:true,data:{installation_id:createId(100+j),label:'Parallel '+j}},env,desktop)));
 assert.equal(attempts.filter(x=>x.status===200).length,1);
 assert.equal(attempts.filter(x=>x.status===409).length,9);
 const current=await (await send('/api/account/license',{},env)).json();
 assert.equal(current.active_devices,10);
 assert.equal((await send('/api/account/license/activate',{method:'POST',bearer:true,
   data:{installation_id:createId(1),label:'Renamed PC'}},env,desktop)).status,200);
 const first=current.devices.find(x=>x.label==='PC 1');
 const path='/api/account/license/devices/'+first.id+'/deactivate';
 assert.equal((await send(path,{method:'POST',origin:base},env)).status,200);
 // A previously registered but deactivated device can reclaim a free slot.
 assert.equal((await send('/api/account/license/activate',{method:'POST',bearer:true,
   data:{installation_id:createId(1),label:'Restored PC'}},env,desktop)).status,200);
 const after=await (await send('/api/account/license',{},env)).json();
 assert.equal(after.active_devices,10);
});

test('another account cannot retrieve, deactivate or export an owner license',async()=>{
 const {env}=await setup();
 const other={id:'0c1eef0e-a68d-4a7d-924d-5d14792f4615',kind:'web'};
 const active=await send('/api/account/license/activate',{method:'POST',bearer:true,
   data:{installation_id:createId(1),label:'Owner PC'}},env,desktop);
 assert.equal(active.status,200);
 const ownerView=await (await send('/api/account/license',{},env)).json();
 const target=ownerView.devices[0].id;
 assert.equal((await send('/api/account/license/backup',{},env,other)).status,404);
 assert.equal((await send('/api/account/license/devices/'+target+'/deactivate',{
   method:'POST',origin:base},env,other)).status,404);
 assert.equal((await (await send('/api/account/license',{},env,other)).json()).plan,'free');
 assert.equal((await (await send('/api/account/license',{},env)).json()).active_devices,1);
});

test('versioned signing defaults to v1 and refuses v2 without a matching configured private key',async()=>{
 const {env}=await setup();
 const issued=await activate(env);
 assert.equal(issued.status,200);
 assert.equal(payloadOf((await issued.json()).license).key_id,'humperdinck-pro-ed25519-v1');
 env.AUTH_DB.devices.length=0;
 env.PRO_LICENSE_ACTIVE_KEY_ID='humperdinck-pro-ed25519-v2';
 assert.equal((await activate(env,{installation_id:createId(554)})).status,503);
 assert.equal(env.AUTH_DB.devices.length,0);
 env.PRO_LICENSE_ACTIVE_KEY_ID='unknown-key-id';
 assert.equal((await activate(env,{installation_id:createId(554)})).status,503);
 env.PRO_LICENSE_ACTIVE_KEY_ID='humperdinck-pro-ed25519-v1';
 assert.equal((await activate(env,{installation_id:createId(554)})).status,200);
});

test('malformed private key rejects issuance BEFORE registering a device',async()=>{
 const {env}=await setup();
 env.PRO_LICENSE_ED25519_PRIVATE=Buffer.from('invalid-pkcs8').toString('base64');
 assert.equal((await send('/api/account/license/activate',{method:'POST',bearer:true,
   data:{installation_id:createId(555),label:'Wrong key'}},env,desktop)).status,503);
 assert.equal(env.AUTH_DB.devices.length,0);
});

test('moving to the per-computer slot releases the old installation slot, even when all ten are used',async()=>{
 const {env}=await setup();
 for(let i=1;i<=10;i++)
   assert.equal((await send('/api/account/license/activate',{method:'POST',bearer:true,
     data:{installation_id:createId(i),label:'PC '+i}},env,desktop)).status,200);
 const moved=await activate(env,{installation_id:createId(900),replaces_installation_id:createId(1)});
 assert.equal(moved.status,200);
 const view=await (await send('/api/account/license',{},env)).json();
 assert.equal(view.active_devices,10);
 assert.equal(view.devices.find(d=>d.label==='PC 1').active,false);
 // Signing in again on the same computer reuses its slot.
 assert.equal((await activate(env,{installation_id:createId(900),replaces_installation_id:createId(1)})).status,200);
 assert.equal((await (await send('/api/account/license',{},env)).json()).active_devices,10);
});

test('a refused move keeps the old slot active',async()=>{
 const {env}=await setup();
 for(let i=1;i<=10;i++)
   await send('/api/account/license/activate',{method:'POST',bearer:true,
     data:{installation_id:createId(i),label:'PC '+i}},env,desktop);
 // The named old slot belongs to nothing on this license: nothing is freed, so the limit applies.
 assert.equal((await activate(env,{installation_id:createId(901),replaces_installation_id:createId(77)})).status,409);
 assert.equal((await (await send('/api/account/license',{},env)).json()).active_devices,10);
 assert.equal((await activate(env,{replaces_installation_id:'nope'})).status,400);
});
