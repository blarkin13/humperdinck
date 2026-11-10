// Owner-controlled beta invitations; Google login is required to claim.
// This module intentionally sends no email, accepts no anonymous claim tokens,
// and never issues a perpetual purchase license.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const fail=(status,error)=>json({error},status);
const now=()=>Math.floor(Date.now()/1000);
const normalEmail=email=>typeof email==='string'?email.trim().toLowerCase():'';
const validEmail=email=>email.length<=254&&email.length>=6&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isOwner=(user,env)=>Boolean(user?.kind==='web'&&env.ANALYTICS_OWNER_ACCOUNT_ID&&user.id===env.ANALYTICS_OWNER_ACCOUNT_ID);
const sameOrigin=req=>req.headers.get('Origin')===new URL(req.url).origin;
async function readJson(request){
 if(Number(request.headers.get('Content-Length')||0)>1024)throw Error('Invalid input');
 const txt=await request.text();
 if(txt.length>1024)throw Error('Invalid input');
 return JSON.parse(txt);
}
async function activeGoogleUser(db,email){
 return db.prepare("SELECT u.id FROM auth_users u JOIN auth_identities i ON i.user_id=u.id WHERE lower(u.email)=? AND i.provider='google' LIMIT 1")
  .bind(email).first();
}
async function hasPurchase(db,userId){
 return db.prepare("SELECT id FROM pro_licenses WHERE user_id=? AND status='active' LIMIT 1").bind(userId).first();
}
export async function handleBetaInvitations(request,env,{session}={}){
 if(env.BETA_FEEDBACK_ENABLED!=='1'||env.BETA_PRO_ENABLED!=='1')
  return fail(404,'Beta invitations unavailable');
 if(!env.AUTH_DB||typeof session!=='function')return fail(503,'Beta invitations unavailable');
 const user=await session(request,env);
 if(!user||user.kind!=='web')return fail(401,'Google account sign-in required');
 const path=new URL(request.url).pathname,owner=isOwner(user,env);
 if(!['GET','POST'].includes(request.method))return fail(405,'Method not allowed');
 if(request.method==='POST'&&!sameOrigin(request))return fail(403,'Invalid request origin');
 try{
  if(path==='/api/beta/admin/invitations'){
   if(!owner)return fail(404,'Not found');
   if(request.method==='GET'){
    const rows=await env.AUTH_DB.prepare(
     'SELECT id,email,created_at,expires_at,accepted_at,revoked_at FROM beta_invitations ORDER BY created_at DESC LIMIT 100').all();
    return json({invitations:rows.results||[]});
   }
   const data=await readJson(request),email=normalEmail(data?.email);
   if(!validEmail(email))return fail(400,'Enter a valid email');
   const existing=await env.AUTH_DB.prepare(
    'SELECT id FROM beta_invitations WHERE email=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? LIMIT 1')
    .bind(email,now()).first();
   if(existing)return fail(409,'An unexpired invitation already exists for this email');
   const stamp=now(),id=crypto.randomUUID();
   const row=await env.AUTH_DB.prepare(
    'INSERT INTO beta_invitations (id,email,created_at,expires_at) VALUES (?,?,?,?)')
    .bind(id,email,stamp,stamp+14*86400).run();
   if(row.meta?.changes!==1)return fail(503,'Invitation could not be created');
   return json({id,email,expires_at:stamp+14*86400,
    invitation_url:new URL('/beta/?invited=1',request.url).toString(),
    mail_sent:false},201);
  }
  const revoke=path.match(/^\/api\/beta\/admin\/invitations\/([0-9a-f-]{36})\/revoke$/i);
  if(revoke){
   if(!owner||request.method!=='POST')return fail(404,'Not found');
   const result=await env.AUTH_DB.prepare(
    'UPDATE beta_invitations SET revoked_at=? WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL')
    .bind(now(),revoke[1]).run();
   if(result.meta?.changes!==1)return fail(404,'Invitation cannot be revoked');
   return json({revoked:true});
  }
  if(path==='/api/beta/invitations/claim'&&request.method==='POST'){
   const email=normalEmail(user.email);
   if(!validEmail(email))return fail(403,'Google account email required');
   const verified=await activeGoogleUser(env.AUTH_DB,email);
   if(!verified||verified.id!==user.id)return fail(403,'Sign in using the invited Google account');
   const invitation=await env.AUTH_DB.prepare(
    'SELECT id FROM beta_invitations WHERE email=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC LIMIT 1')
    .bind(email,now()).first();
   if(!invitation)return fail(404,'No active invitation for this Google account');
   if(await hasPurchase(env.AUTH_DB,user.id))
    return fail(409,'This account already has an active lifetime Pro entitlement; beta cannot replace it');
   const stamp=now(),id=crypto.randomUUID();
   // One conditional statement ensures an invitation can be claimed once.
   const result=await env.AUTH_DB.prepare(
    'INSERT INTO beta_pro_grants (id,user_id,issued_at,expires_at,revoked_at,created_at) '+
    'SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM beta_invitations WHERE id=? AND email=? '+
    'AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>?) '+
    'AND NOT EXISTS (SELECT 1 FROM beta_pro_grants WHERE user_id=? AND revoked_at IS NULL AND expires_at>?)')
    .bind(id,user.id,stamp,stamp+30*86400,null,stamp,invitation.id,email,stamp,user.id,stamp).run();
   if(result.meta?.changes!==1)return fail(409,'An active beta grant already exists or invitation is unavailable');
   await env.AUTH_DB.prepare('UPDATE beta_invitations SET accepted_at=?,accepted_user_id=? WHERE id=? AND accepted_at IS NULL')
    .bind(stamp,user.id,invitation.id).run();
   return json({claimed:true,expires_at:stamp+30*86400},201);
  }
  // Limited, explicitly owner-authorized test-commerce cleanup. Never erase
  // test transaction history, touch live purchases, or revoke a license with
  // registered devices that could already hold a portable offline certificate.
  if(path==='/api/beta/admin/test-license/revoke'&&request.method==='POST'){
   if(!owner)return fail(404,'Not found');
   const data=await readJson(request),email=normalEmail(data?.email);
   if(!validEmail(email)||data?.confirm!=='REVOKE TEST LICENSE')
    return fail(400,'Email and exact confirmation required');
   const target=await env.AUTH_DB.prepare(
    'SELECT p.id,p.user_id FROM pro_licenses p JOIN auth_users u ON u.id=p.user_id '+
    "WHERE lower(u.email)=? AND p.status='active' AND p.provider='lemonsqueezy-test' LIMIT 1")
    .bind(email).first();
   if(!target)return fail(404,'No active Lemon Squeezy test license for that account');
   const devices=await env.AUTH_DB.prepare('SELECT COUNT(*) AS count FROM pro_devices WHERE license_id=?').bind(target.id).first();
   if(Number(devices?.count||0)>0)return fail(409,'Existing registered devices require a separate offline license review');
   const result=await env.AUTH_DB.prepare(
    "UPDATE pro_licenses SET status='revoked' WHERE id=? AND user_id=? AND status='active' AND provider='lemonsqueezy-test'")
    .bind(target.id,target.user_id).run();
   if(result.meta?.changes!==1)return fail(409,'Test license already changed');
   return json({revoked:true,account_email:email,purchase_history_preserved:true,
    warning:'Any previously exported perpetual offline certificate cannot be remotely revoked.'});
  }
  return fail(404,'Unknown beta invitation route');
 }catch{
  return fail(400,'Invalid invitation request');
 }
}
