/* Humperdinck one-time lifetime Pro license *infrastructure*.
 * A real purchase provider must insert grants through a separately verified,
 * private checkout webhook. NO customer/admin grant-issuance HTTP endpoint here.
 * Portable grants are intentionally NOT machine-locked: offline forever wins
 * over strict remote enforcement of a ten-device cap.
 */
const KEY_ID='humperdinck-pro-ed25519-v1';
export const PRO_PUBLIC_KEY_BASE64='YIYroSRZsiMKFXj7PL3i/YX847sGx9muPqIY0r15JTQ=';
const encoder=new TextEncoder();
const b64url=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const b64bytes=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const err=(status,message)=>response({error:message},status);
const clock=()=>Math.floor(Date.now()/1000);
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(x);
async function readJson(req){
  if((Number(req.headers.get('Content-Length'))||0)>4096
      ||!req.headers.get('Content-Type')?.startsWith('application/json'))return {};
  try{return await req.json()}catch{return {}}
}
const authorizedMutate=(request,webUser,sameOrigin)=>{
  const bearer=request.headers.get('Authorization')?.startsWith('Bearer ');
  return bearer?webUser?.kind==='desktop':webUser?.kind==='web'&&sameOrigin(request);
};
async function licenseForUser(env,userId){
  return env.AUTH_DB.prepare("SELECT id,user_id,status,issued_at,max_devices FROM pro_licenses WHERE user_id=? AND status='active'")
    .bind(userId).first();
}
async function devicesFor(env,licenseId){
  const r=await env.AUTH_DB.prepare('SELECT id,label,activated_at,last_seen_at,deactivated_at FROM pro_devices WHERE license_id=? ORDER BY activated_at DESC')
    .bind(licenseId).all();
  return (r.results||[]).map(d=>({id:d.id,label:d.label,activated_at:d.activated_at,
    last_seen_at:d.last_seen_at,active:d.deactivated_at===null}));
}
function grantPayload(license){
  return {version:1,type:'humperdinck.pro.perpetual',key_id:KEY_ID,
    license_id:license.id,subject:license.user_id,issued_at:license.issued_at,features:['pro'],
    transfer:'portable-offline-backup',expires_at:null};
}
async function signer(env){
  if(!env.PRO_LICENSE_ED25519_PRIVATE)throw Error('Pro license signing key not configured');
  const key=b64bytes(env.PRO_LICENSE_ED25519_PRIVATE);
  return crypto.subtle.importKey('pkcs8',key,{name:'Ed25519'},false,['sign']);
}
async function signLicense(license,key){
  const data=encoder.encode(JSON.stringify(grantPayload(license)));
  const signature=await crypto.subtle.sign('Ed25519',key,data);
  return b64url(data)+'.'+b64url(signature);
}
async function licenseOverview(env,user){
  const license=await licenseForUser(env,user.id);
  if(!license)return {plan:'free',license:null,devices:[],active_devices:0,
    device_limit:10,checkout_available:false};
  const devices=await devicesFor(env,license.id);
  return {plan:'pro',license:{id:license.id,lifetime:true,issued_at:license.issued_at,
      backup_available:!!env.PRO_LICENSE_ED25519_PRIVATE},devices,
    active_devices:devices.filter(d=>d.active).length,device_limit:license.max_devices,
    checkout_available:false,
    warning:devices.filter(d=>d.active).length>=8?'You are nearing your ten-device limit.':null};
}
export async function handleProLicense(request,env,{session,sameOrigin}){
  const path=new URL(request.url).pathname;
  const user=await session(request,env);
  if(!user)return err(401,'Sign in to view or activate a Pro license');
  if(path==='/api/account/license'&&request.method==='GET')
    return response(await licenseOverview(env,user));

  if(path==='/api/account/license/backup'&&request.method==='GET'){
    const license=await licenseForUser(env,user.id);
    if(!license)return err(404,'No purchased Pro license is associated with this account');
    if(!env.PRO_LICENSE_ED25519_PRIVATE)return err(503,'License backup service is not ready');
    const key=await signer(env);
    return response({license:await signLicense(license,key),filename:'humperdinck-pro-license.json',
      format:'humperdinck-offline-v1',portable:true});
  }

  if(path==='/api/account/license/activate'&&request.method==='POST'){
    if(user.kind!=='desktop'||!request.headers.get('Authorization')?.startsWith('Bearer '))
      return err(403,'Desktop account connection required for device activation');
    const data=await readJson(request);
    if(!uuid(data.installation_id)||typeof data.label!=='string'||data.label.length>80||!data.label.trim())
      return err(400,'Invalid installation identifier or device label');
    const license=await licenseForUser(env,user.id);
    if(!license)return err(403,'A verified Pro purchase is required before activation');
    if(!env.PRO_LICENSE_ED25519_PRIVATE)return err(503,'License signing is not configured');
    const key=await signer(env); // check key before writing registration
    const existing=await env.AUTH_DB.prepare(
      'SELECT id,deactivated_at FROM pro_devices WHERE license_id=? AND installation_id=?')
      .bind(license.id,data.installation_id).first();
    if(existing?.deactivated_at===null){
      await env.AUTH_DB.prepare('UPDATE pro_devices SET label=?,last_seen_at=? WHERE id=? AND license_id=?')
        .bind(data.label.trim(),clock(),existing.id,license.id).run();
    }else if(existing){
      const changed=await env.AUTH_DB.prepare(
        'UPDATE pro_devices SET deactivated_at=NULL,label=?,activated_at=?,last_seen_at=? WHERE id=? AND license_id=? AND deactivated_at IS NOT NULL AND (SELECT COUNT(*) FROM pro_devices WHERE license_id=? AND deactivated_at IS NULL) < ?')
        .bind(data.label.trim(),clock(),clock(),existing.id,license.id,license.id,license.max_devices).run();
      if(changed.meta?.changes!==1)return err(409,'All ten Pro device slots are in use. Deactivate one in your account.');
    }else{
      const deviceId=crypto.randomUUID();
      const added=await env.AUTH_DB.prepare(
        'INSERT INTO pro_devices(id,license_id,installation_id,label,activated_at,last_seen_at,deactivated_at) SELECT ?,?,?,?,?,?,NULL WHERE (SELECT COUNT(*) FROM pro_devices WHERE license_id=? AND deactivated_at IS NULL) < ?')
        .bind(deviceId,license.id,data.installation_id,data.label.trim(),clock(),clock(),license.id,license.max_devices).run();
      if(added.meta?.changes!==1)return err(409,'All ten Pro device slots are in use. Deactivate one in your account.');
    }
    const status=await licenseOverview(env,user);
    return response({activated:true,license:await signLicense(license,key),
      plan:status.plan,active_devices:status.active_devices,device_limit:status.device_limit,
      warning:status.warning});
  }

  const deactivation=path.match(/^\/api\/account\/license\/devices\/([a-f0-9-]{36})\/deactivate$/i);
  if(deactivation&&request.method==='POST'){
    if(!authorizedMutate(request,user,sameOrigin))return err(403,'Invalid session or request origin');
    if(!uuid(deactivation[1]))return err(400,'Invalid device');
    const license=await licenseForUser(env,user.id);
    if(!license)return err(404,'No active license');
    const result=await env.AUTH_DB.prepare(
      'UPDATE pro_devices SET deactivated_at=? WHERE id=? AND license_id=? AND deactivated_at IS NULL')
      .bind(clock(),deactivation[1],license.id).run();
    if(result.meta?.changes!==1)return err(404,'Device is not active on your account');
    return response({deactivated:true,...await licenseOverview(env,user)});
  }
  return err(404,'Unknown license endpoint');
}
