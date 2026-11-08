/* Optional Humperdinck customer accounts on Cloudflare Workers + D1.
 * No account or cloud request is required for Free desktop narration.
 * OAuth code flow + PKCE + cryptographically validated OIDC ID tokens.
 */
const ORIGIN = 'https://humperdinck.studio';
const COOKIE = '__Host-humperdinck_session';
const FLOW_COOKIE = '__Host-humperdinck_oauth';
const WEB_TTL = 30 * 86400, DESKTOP_TTL = 90 * 86400, FLOW_TTL = 600;
const enc = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {
  status, headers: {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff', ...headers}
});
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64 = str => Uint8Array.from(atob(str.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-str.length%4)%4)),c=>c.charCodeAt(0));
const random = (bytes=32) => b64(crypto.getRandomValues(new Uint8Array(bytes)));
const hash = async s => b64(await crypto.subtle.digest('SHA-256',enc.encode(s)));
const sameOrigin = request => request.headers.get('Origin') === new URL(request.url).origin;
const configured = env => Boolean(env.AUTH_DB && env.AUTH_RATE_SECRET);
const providers = env => ({
  google: configured(env)&&Boolean(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET),
  apple: configured(env)&&Boolean(env.APPLE_CLIENT_ID&&env.APPLE_TEAM_ID&&env.APPLE_KEY_ID&&env.APPLE_PRIVATE_KEY)
});
const host = env => (env.AUTH_PUBLIC_ORIGIN || ORIGIN).replace(/\/$/,'');
const go = (url, cookie='') => {
  const headers = {'Location':url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
  if(cookie)headers['Set-Cookie']=cookie;
  return new Response(null,{status:303,headers});
};
const cookie = (name,value,age,sameSite='Lax') =>
  `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=${sameSite}`;
const clearCookie = (name,sameSite='Lax') => cookie(name,'',0,sameSite);
function readCookie(request,name){
  const h=request.headers.get('Cookie')||'';
  const v=h.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='));
  return v?.slice(name.length+1)||'';
}
function validCode(code){return typeof code==='string'&&/^[A-Z2-7]{10}$/.test(code)}
function validId(id){return typeof id==='string'&&/^[A-Za-z0-9_-]{43}$/.test(id)}
function safeReturn(value){
  if(typeof value!=='string')return '/account/';
  if(value==='/account/')return value;
  if(/^\/account\/\?device=[A-Z2-7]{10}$/.test(value))return value;
  return '/account/';
}
async function body(request){
  if(Number(request.headers.get('Content-Length')||0)>4096)return {};
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return {};
  try{return await request.json()}catch{return {}}
}
function problem(status,message){return json({error:message},status)}
async function rateLimit(request,env,kind,limit=12){
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const key=await hash(env.AUTH_RATE_SECRET+'|'+kind+'|'+ip);
  const cutoff=now()-600;
  await env.AUTH_DB.prepare('DELETE FROM auth_rate WHERE created_at < ?').bind(cutoff).run();
  const count=await env.AUTH_DB.prepare('SELECT COUNT(*) AS count FROM auth_rate WHERE bucket = ?').bind(key).first();
  if(Number(count?.count||0)>=limit)return false;
  await env.AUTH_DB.prepare('INSERT INTO auth_rate (bucket, created_at) VALUES (?, ?)').bind(key,now()).run();
  return true;
}
async function session(request,env){
  const raw=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1]
    || readCookie(request,COOKIE);
  if(!validId(raw))return null;
  const row=await env.AUTH_DB.prepare(
    'SELECT u.id, u.display_name, u.email, s.token_hash, s.kind, s.expires_at FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?'
  ).bind(await hash(raw),now()).first();
  return row||null;
}
async function profile(env,user){
  const identities=await env.AUTH_DB.prepare('SELECT provider FROM auth_identities WHERE user_id=?').bind(user.id).all();
  return {id:user.id,email:user.email||null,display_name:user.display_name||null,
    providers:(identities.results||[]).map(r=>r.provider),plan:'free'};
}
async function saveSession(env,userId,kind){
  const token=random(), expire=now()+(kind==='desktop'?DESKTOP_TTL:WEB_TTL);
  await env.AUTH_DB.prepare('INSERT INTO auth_sessions (token_hash,user_id,kind,created_at,expires_at) VALUES (?,?,?,?,?)')
    .bind(await hash(token),userId,kind,now(),expire).run();
  return {token,expires_at:expire};
}
async function verifyIdentity(jwt,provider,clientId,expectedNonce){
  if(typeof jwt!=='string'||jwt.length>12000)throw Error('Missing identity token');
  const segments=jwt.split('.');
  if(segments.length!==3)throw Error('Invalid identity token');
  const header=JSON.parse(new TextDecoder().decode(unb64(segments[0])));
  if(header.alg!=='RS256'||typeof header.kid!=='string')throw Error('Unsupported identity signature');
  const keysURL=provider==='google'?'https://www.googleapis.com/oauth2/v3/certs':'https://appleid.apple.com/auth/keys';
  const response=await fetch(keysURL,{headers:{'Accept':'application/json'}});
  if(!response.ok)throw Error('Identity key lookup failed');
  const keys=await response.json();
  const jwk=keys.keys?.find(k=>k.kid===header.kid && k.kty==='RSA' && (!k.alg||k.alg==='RS256'));
  if(!jwk)throw Error('Identity signing key not found');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,unb64(segments[2]),enc.encode(segments[0]+'.'+segments[1]));
  if(!verified)throw Error('Invalid identity signature');
  const claim=JSON.parse(new TextDecoder().decode(unb64(segments[1])));
  const issuer=provider==='google'?['accounts.google.com','https://accounts.google.com']:['https://appleid.apple.com'];
  if(!issuer.includes(claim.iss)||claim.aud!==clientId||claim.nonce!==expectedNonce
      ||!Number.isFinite(claim.exp)||claim.exp<=now()||!Number.isFinite(claim.iat)||claim.iat>now()+60
      ||typeof claim.sub!=='string'||!claim.sub||claim.sub.length>255)
    throw Error('Invalid identity claims');
  return claim;
}
async function appleSecret(env){
  const head=b64(enc.encode(JSON.stringify({alg:'ES256',kid:env.APPLE_KEY_ID,typ:'JWT'})));
  const issued=now();
  const payload=b64(enc.encode(JSON.stringify({iss:env.APPLE_TEAM_ID,iat:issued,exp:issued+1800,
    aud:'https://appleid.apple.com',sub:env.APPLE_CLIENT_ID})));
  const pem=env.APPLE_PRIVATE_KEY.replace(/\\n/g,'\n');
  const binary=pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(binary),c=>c.charCodeAt(0)),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const input=head+'.'+payload;
  const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,enc.encode(input));
  return input+'.'+b64(sig);
}
async function oauthStart(request,env,provider){
  if(!providers(env)[provider])return problem(503,'This sign-in provider is not configured yet');
  if(!await rateLimit(request,env,'oauth',20))return problem(429,'Too many sign-in attempts');
  const url=new URL(request.url), returnPath=safeReturn(url.searchParams.get('return_to'));
  const state=random(),nonce=random(),verifier=random(),challenge=await hash(verifier);
  await env.AUTH_DB.prepare('INSERT INTO auth_flows (state_hash,provider,nonce,verifier,return_path,expires_at) VALUES (?,?,?,?,?,?)')
    .bind(await hash(state),provider,nonce,verifier,returnPath,now()+FLOW_TTL).run();
  const redirect=host(env)+'/api/account/callback/'+provider;
  const p=new URLSearchParams({client_id:env[provider==='google'?'GOOGLE_CLIENT_ID':'APPLE_CLIENT_ID'],
    redirect_uri:redirect,response_type:'code',scope:provider==='google'?'openid email profile':'name email',
    state,nonce});
  if(provider==='google'){p.set('code_challenge',challenge);p.set('code_challenge_method','S256');}
  else p.set('response_mode','form_post');
  const endpoint=provider==='google'?'https://accounts.google.com/o/oauth2/v2/auth':'https://appleid.apple.com/auth/authorize';
  // SameSite=None is required because Apple's authorization callback is form_post.
  return go(endpoint+'?'+p.toString(),cookie(FLOW_COOKIE,state,FLOW_TTL,'None'));
}
async function oauthCallback(request,env,provider){
  if(!providers(env)[provider])return problem(503,'Provider is not configured');
  let p;
  if(provider==='google'&&request.method==='GET')p=new URL(request.url).searchParams;
  else if(provider==='apple'&&request.method==='POST') {
    if(Number(request.headers.get('Content-Length')||0)>16384)return problem(400,'Invalid callback');
    p=new URLSearchParams(await request.text());
  }else return problem(405,'Unsupported callback method');
  const state=p.get('state'),code=p.get('code');
  if(!validId(state)||!code||code.length>4096||readCookie(request,FLOW_COOKIE)!==state)
    return problem(400,'Invalid or expired sign-in state');
  const stateHash=await hash(state);
  const flow=await env.AUTH_DB.prepare('SELECT * FROM auth_flows WHERE state_hash=? AND provider=? AND expires_at>?')
    .bind(stateHash,provider,now()).first();
  if(!flow)return problem(400,'Sign-in session expired');
  const removed=await env.AUTH_DB.prepare('DELETE FROM auth_flows WHERE state_hash=?').bind(stateHash).run();
  if(removed.meta?.changes!==1)return problem(400,'Sign-in session already used');
  try{
    const form=new URLSearchParams({client_id:env[provider==='google'?'GOOGLE_CLIENT_ID':'APPLE_CLIENT_ID'],
      client_secret:provider==='google'?env.GOOGLE_CLIENT_SECRET:await appleSecret(env),
      grant_type:'authorization_code',code,redirect_uri:host(env)+'/api/account/callback/'+provider});
    if(provider==='google')form.set('code_verifier',flow.verifier);
    const endpoint=provider==='google'?'https://oauth2.googleapis.com/token':'https://appleid.apple.com/auth/token';
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form.toString()});
    if(!response.ok)throw Error('Identity provider rejected the authorization code');
    const tokens=await response.json();
    const claim=await verifyIdentity(tokens.id_token,provider,env[provider==='google'?'GOOGLE_CLIENT_ID':'APPLE_CLIENT_ID'],flow.nonce);
    const existing=await env.AUTH_DB.prepare('SELECT user_id FROM auth_identities WHERE provider=? AND subject=?')
      .bind(provider,claim.sub).first();
    let userId=existing?.user_id;
    let displayName=(claim.name||'').slice(0,120);
    if(provider==='apple'&&p.get('user')){
      try{const name=JSON.parse(p.get('user')).name;displayName=[name?.firstName,name?.lastName].filter(Boolean).join(' ').slice(0,120);}catch{}
    }
    const email=(claim.email_verified===true||claim.email_verified==='true')
      &&typeof claim.email==='string'?claim.email.slice(0,320):null;
    if(!userId){
      userId=crypto.randomUUID();
      await env.AUTH_DB.prepare('INSERT INTO auth_users (id,display_name,email,created_at) VALUES (?,?,?,?)')
        .bind(userId,displayName||null,email,now()).run();
      // Never silently link different identity providers by a matching email.
      await env.AUTH_DB.prepare('INSERT INTO auth_identities (provider,subject,user_id,created_at) VALUES (?,?,?,?)')
        .bind(provider,claim.sub,userId,now()).run();
    }else{
      await env.AUTH_DB.prepare('UPDATE auth_users SET display_name=COALESCE(display_name,?),email=COALESCE(email,?) WHERE id=?')
        .bind(displayName||null,email,userId).run();
    }
    const saved=await saveSession(env,userId,'web');
    const headers={'Location':host(env)+safeReturn(flow.return_path),'Cache-Control':'no-store',
      'Referrer-Policy':'no-referrer','Set-Cookie':cookie(COOKIE,saved.token,WEB_TTL)};
    // OAuth state cookie expires on its own; it cannot be read by scripts.
    return new Response(null,{status:303,headers});
  }catch(error){
    console.error('Humperdinck identity callback failed:',error.message);
    return go(host(env)+'/account/?error=login_failed');
  }
}
async function beginDevice(request,env){
  if(!await rateLimit(request,env,'device',10))return problem(429,'Too many device requests');
  const data=await body(request);
  if(!validId(data.challenge))return problem(400,'Invalid desktop challenge');
  const id=random();
  // Ten RFC-4648 Base32 characters give 50 bits of entropy.
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const codeBytes=crypto.getRandomValues(new Uint8Array(10));
  const safeCode=Array.from(codeBytes,b=>alphabet[b%alphabet.length]).join('');
  await env.AUTH_DB.prepare('INSERT INTO auth_device_flows (id,code,challenge,expires_at,created_at) VALUES (?,?,?,?,?)')
    .bind(id,safeCode,data.challenge,now()+FLOW_TTL,now()).run();
  return json({request_id:id,verification_url:host(env)+'/account/?device='+safeCode,expires_in:FLOW_TTL});
}
async function approveDevice(request,env){
  if(!sameOrigin(request))return problem(403,'Invalid request origin');
  const user=await session(request,env);
  if(!user||user.kind!=='web')return problem(401,'Sign in to approve this computer');
  const data=await body(request);
  if(!validCode(data.code))return problem(400,'Invalid device code');
  const result=await env.AUTH_DB.prepare(
    'UPDATE auth_device_flows SET user_id=?,approved_at=? WHERE code=? AND user_id IS NULL AND expires_at>?')
    .bind(user.id,now(),data.code,now()).run();
  if(result.meta?.changes!==1)return problem(404,'Device request expired or already approved');
  return json({approved:true});
}
async function pollDevice(request,env){
  const data=await body(request);
  if(!validId(data.request_id)||!validId(data.verifier))return problem(400,'Invalid device request');
  const flow=await env.AUTH_DB.prepare('SELECT * FROM auth_device_flows WHERE id=? AND expires_at>?')
    .bind(data.request_id,now()).first();
  if(!flow||flow.challenge!==await hash(data.verifier))return problem(404,'Device sign-in request expired');
  if(!flow.user_id)return json({status:'pending'},202);
  const deleted=await env.AUTH_DB.prepare('DELETE FROM auth_device_flows WHERE id=? AND user_id=?')
    .bind(data.request_id,flow.user_id).run();
  if(deleted.meta?.changes!==1)return problem(409,'Sign-in already completed');
  const token=await saveSession(env,flow.user_id,'desktop');
  const account=await env.AUTH_DB.prepare('SELECT * FROM auth_users WHERE id=?').bind(flow.user_id).first();
  return json({status:'complete',access_token:token.token,expires_at:token.expires_at,
    user:await profile(env,account)});
}
export async function handleAccount(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/api/account/config'&&request.method==='GET')
    return json({available:configured(env),providers:providers(env),desktop_connection:configured(env)});
  if(!configured(env))return problem(503,'Customer accounts are not configured yet');
  try{
    if(path==='/api/account/me'&&request.method==='GET'){
      const user=await session(request,env);
      return user?json({authenticated:true,user:await profile(env,user)}):json({authenticated:false});
    }
    if(path==='/api/account/logout'&&request.method==='POST'){
      // Web sessions must have same-origin CSRF check; native bearer logout is allowed.
      const bearer=Boolean(request.headers.get('Authorization'));
      if(!bearer&&!sameOrigin(request))return problem(403,'Invalid request origin');
      const user=await session(request,env);
      if(user)await env.AUTH_DB.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(user.token_hash).run();
      return json({ok:true},200,bearer?{}:{'Set-Cookie':clearCookie(COOKIE)});
    }
    if(path.startsWith('/api/account/start/')&&request.method==='GET'){
      const provider=path.split('/').pop();
      if(!['google','apple'].includes(provider))return problem(404,'Unknown provider');
      return oauthStart(request,env,provider);
    }
    if(path.startsWith('/api/account/callback/')){
      const provider=path.split('/').pop();
      if(!['google','apple'].includes(provider))return problem(404,'Unknown provider');
      return oauthCallback(request,env,provider);
    }
    if(path==='/api/account/device/begin'&&request.method==='POST')return beginDevice(request,env);
    if(path==='/api/account/device/approve'&&request.method==='POST')return approveDevice(request,env);
    if(path==='/api/account/device/poll'&&request.method==='POST')return pollDevice(request,env);
    return problem(404,'Unknown account route');
  }catch(error){
    console.error('Humperdinck accounts:',error.message);
    return problem(503,'Account service temporarily unavailable');
  }
}
