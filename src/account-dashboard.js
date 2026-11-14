import {limitedJson} from './limited-json.js';
import {handleAccountPrivacy} from './account-privacy.js';
import {handleOwnerAnalytics} from './owner-analytics.js';
/* Authenticated account dashboard, connected desktops and offline account recovery.
 * Free has no cloud requirement. No payment provider, receipt generation or license
 * issuance is exposed by these routes.
 */
const enc=new TextEncoder();
const now=()=>Math.floor(Date.now()/1000);
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff',...headers}});
const problem=(status,message)=>json({error:message},status);
const validUUID=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const validId=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);
const codePattern=/^[A-Za-z0-9_-]{32}$/;
const random=bytes=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
 .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const digest=async text=>{
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(text)));
 return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const body=req=>limitedJson(req,4096);
async function overview(env,user){
 const [identities,purchase,desktops,legacy,codes,account]=await Promise.all([
  env.AUTH_DB.prepare('SELECT provider FROM auth_identities WHERE user_id=? ORDER BY provider').bind(user.id).all(),
  env.AUTH_DB.prepare('SELECT id,status,issued_at,max_devices,provider,purchase_ref FROM pro_licenses WHERE user_id=? ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, issued_at DESC LIMIT 1').bind(user.id).first(),
  env.AUTH_DB.prepare("SELECT c.id,c.label,c.connected_at,c.last_seen_at,s.expires_at FROM auth_connected_desktops c JOIN auth_sessions s ON c.token_hash=s.token_hash WHERE c.user_id=? AND s.kind='desktop' AND s.expires_at>? ORDER BY c.connected_at DESC LIMIT 100").bind(user.id,now()).all(),
  env.AUTH_DB.prepare("SELECT COUNT(*) AS count FROM auth_sessions s LEFT JOIN auth_connected_desktops c ON s.token_hash=c.token_hash WHERE s.user_id=? AND s.kind='desktop' AND s.expires_at>? AND c.id IS NULL").bind(user.id,now()).first(),
  env.AUTH_DB.prepare('SELECT COUNT(*) AS count FROM auth_recovery_codes WHERE user_id=?').bind(user.id).first(),
  env.AUTH_DB.prepare('SELECT id,display_name,email,created_at FROM auth_users WHERE id=?').bind(user.id).first()
 ]);
 const status=purchase?.status||'none';
 return {account:{id:user.id,display_name:account?.display_name||null,email:account?.email||null,
      created_at:account?.created_at||null,providers:[...new Set((identities.results||[]).map(x=>x.provider))]},
  purchase:{status,edition:status==='active'?'pro':'free',lifetime:status==='active',
    issued_at:purchase?.issued_at||null,provider:purchase?.provider||null,
    reference:purchase?.purchase_ref||null,checkout_available:false,
    receipt_available:false},
  connected_desktops:(desktops.results||[]).map(d=>({id:d.id,label:d.label,
    connected_at:d.connected_at,last_seen_at:d.last_seen_at,expires_at:d.expires_at})),
  older_desktop_sessions:Number(legacy?.count||0),
  recovery:{codes_remaining:Number(codes?.count||0),max_codes:8,requires_provider:false}};
}
export async function handleAccountDashboard(request,env,{session,sameOrigin,saveSession,cookie,cookieName,rateLimit}){
 const path=new URL(request.url).pathname;
 if(path==='/api/account/recovery/redeem'&&request.method==='POST'){
  // A recovery code is a one-time high-entropy backup sign-in credential.
  // Same-origin + JSON prevent cross-site form submission; D1 rate limiting
  // works even for accounts with no browser cookie.
  if(!sameOrigin(request))return problem(403,'Use the Humperdinck account recovery page');
  if(!await rateLimit(request,env,'recovery',6))return problem(429,'Too many recovery attempts. Try again later.');
  const input=await body(request);
  if(!validUUID(input.account_id)||!codePattern.test(input.code||''))
    return problem(401,'Invalid or already-used recovery code');
  const codeHash=await digest(env.AUTH_RATE_SECRET+'|recovery|'+input.account_id+'|'+input.code);
  const used=await env.AUTH_DB.prepare('DELETE FROM auth_recovery_codes WHERE user_id=? AND code_hash=?')
    .bind(input.account_id,codeHash).run();
  if(used.meta?.changes!==1)return problem(401,'Invalid or already-used recovery code');
  const account=await env.AUTH_DB.prepare('SELECT id FROM auth_users WHERE id=?').bind(input.account_id).first();
  if(!account)return problem(401,'Invalid or already-used recovery code');
  const saved=await saveSession(env,account.id,'web');
  return json({recovered:true},200,{'Set-Cookie':cookie(cookieName,saved.token,30*86400)});
 }
 const user=await session(request,env);
 if(!user)return problem(401,'Sign in to manage your account');
 if(path.startsWith('/api/account/privacy/'))return handleAccountPrivacy(request,env,{user,sameOrigin});
 if(path==='/api/account/dashboard/analytics')return handleOwnerAnalytics(request,env,{user});
 if(path==='/api/account/dashboard'&&request.method==='GET')
  return json(await overview(env,user));

 if(path==='/api/account/dashboard/connections/register'&&request.method==='POST'){
  // Only an authenticated desktop bearer can attach its random installation ID.
  if(user.kind!=='desktop'||!request.headers.get('Authorization')?.startsWith('Bearer '))
   return problem(403,'A connected desktop session is required');
  const data=await body(request);
  if(!validUUID(data.installation_id)||typeof data.label!=='string'||
      !data.label.trim()||data.label.length>80)return problem(400,'Invalid installation label or identifier');
  const existing=await env.AUTH_DB.prepare('SELECT id FROM auth_connected_desktops WHERE token_hash=?')
   .bind(user.token_hash).first();
  const id=existing?.id||crypto.randomUUID();
  await env.AUTH_DB.prepare(
   'INSERT INTO auth_connected_desktops (id,user_id,token_hash,installation_id,label,connected_at,last_seen_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(token_hash) DO UPDATE SET label=excluded.label,installation_id=excluded.installation_id,last_seen_at=excluded.last_seen_at'
  ).bind(id,user.id,user.token_hash,data.installation_id,data.label.trim(),now(),now()).run();
  return json({connected:true,id});
 }

 if(path==='/api/account/dashboard/recovery/codes'&&request.method==='POST'){
  if(user.kind!=='web'||!sameOrigin(request))
   return problem(403,'Sign in to this website to generate recovery codes');
  const codes=Array.from({length:8},()=>random(24));
  const hashed=await Promise.all(codes.map(code=>digest(env.AUTH_RATE_SECRET+'|recovery|'+user.id+'|'+code)));
  // D1 batch executes atomically: a failed insertion cannot leave a half-written set.
  await env.AUTH_DB.batch([
    env.AUTH_DB.prepare('DELETE FROM auth_recovery_codes WHERE user_id=?').bind(user.id),
    ...hashed.map(codeHash=>env.AUTH_DB.prepare(
      'INSERT INTO auth_recovery_codes (user_id,code_hash,created_at) VALUES (?,?,?)'
     ).bind(user.id,codeHash,now()))
  ]);
  return json({format:'humperdinck-account-recovery-v1',account_id:user.id,
    created_at:now(),codes,warning:'Each code works once. Anyone holding a code and your account ID can sign into your account. Save securely; generating a new kit invalidates prior unused codes.'});
 }
 if(path==='/api/account/dashboard/connections/revoke-all'&&request.method==='POST'){
  if(user.kind!=='web'||!sameOrigin(request))return problem(403,'Invalid session or request origin');
  const result=await env.AUTH_DB.prepare("DELETE FROM auth_sessions WHERE user_id=? AND kind='desktop'")
   .bind(user.id).run();
  return json({revoked:Number(result.meta?.changes||0)});
 }
 const match=path.match(/^\/api\/account\/dashboard\/connections\/([a-f0-9-]{36})\/revoke$/i);
 if(match&&request.method==='POST'){
  if(user.kind!=='web'||!sameOrigin(request))return problem(403,'Invalid session or request origin');
  if(!validId(match[1]))return problem(400,'Invalid connection identifier');
  const result=await env.AUTH_DB.prepare("DELETE FROM auth_sessions WHERE token_hash IN (SELECT token_hash FROM auth_connected_desktops WHERE id=? AND user_id=?) AND user_id=? AND kind='desktop'")
   .bind(match[1],user.id,user.id).run();
  if(result.meta?.changes!==1)return problem(404,'Connection is already disconnected');
  return json({revoked:true});
 }
 return problem(404,'Unknown account dashboard route');
}

// Linking a replacement Google/Apple identity uses a pre-existing web session,
// one-time OAuth state, and the original session hash stored server-side.
export async function createLinkIntent(env,stateHash,user){
 await env.AUTH_DB.prepare('DELETE FROM auth_link_intents WHERE expires_at < ?').bind(now()).run();
 await env.AUTH_DB.prepare('INSERT INTO auth_link_intents (state_hash,user_id,session_hash,expires_at) VALUES (?,?,?,?)')
  .bind(stateHash,user.id,user.token_hash,now()+600).run();
}
export async function readLinkIntent(env,stateHash){
 const intent=await env.AUTH_DB.prepare('SELECT user_id,session_hash FROM auth_link_intents WHERE state_hash=? AND expires_at>?')
  .bind(stateHash,now()).first();
 if(!intent)throw Error('Account linking request expired');
 const authorized=await env.AUTH_DB.prepare("SELECT token_hash FROM auth_sessions WHERE token_hash=? AND user_id=? AND kind='web' AND expires_at>?")
  .bind(intent.session_hash,intent.user_id,now()).first();
 if(!authorized)throw Error('Account linking session expired');
 return intent.user_id;
}
