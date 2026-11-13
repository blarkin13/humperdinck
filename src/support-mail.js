/* Humperdinck Mail: owner-only inbox, private MIME storage, Resend replies.
 * Disabled by default. Never changes current Email Routing rules.
 * Raw customer messages are sensitive; no public URLs, no HTML rendering.
 */
import {limitedJson} from './limited-json.js';
import {mimeText,safeMailHeader} from './support-mail-mime.js';

const ALIASES=new Set(['support@humperdinck.studio','billing@humperdinck.studio','privacy@humperdinck.studio','legal@humperdinck.studio']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL=/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i;
const now=()=>Math.floor(Date.now()/1000);
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
const fail=(status,error)=>json({error},status);
const originOK=req=>req.headers.get('Origin')===new URL(req.url).origin;
const emailOnly=value=>{
 const text=safeMailHeader(value).trim();
 const address=text.match(/<([^<>]+)>/)?.[1]||text;
 const lower=address.toLowerCase();
 return lower.length<=254&&EMAIL.test(lower)?lower:'';
};
const messageId=s=>{
 const value=safeMailHeader(s);
 return /^<[^<>\s]{3,240}>$/.test(value)?value:null;
};
const inReplyTo=s=>messageId((safeMailHeader(s).match(/<[^<>\s]+>/)||[])[0]);
function senderLabel(alias){
 const name=alias.split('@')[0];
 return 'Humperdinck '+name[0].toUpperCase()+name.slice(1)+' <'+alias+'>';
}
function cleanSubject(subject){return safeMailHeader(subject).slice(0,200)||'(No subject)';}
function owner(session,env){return Boolean(session?.kind==='web'&&env.ANALYTICS_OWNER_ACCOUNT_ID&&session.id===env.ANALYTICS_OWNER_ACCOUNT_ID);}
function storeConfigured(env){return Boolean(env.AUTH_DB&&env.MAIL_MESSAGES);}
async function threadRow(db,id){
 return db.prepare('SELECT id,alias,contact_email,subject,status,created_at,updated_at FROM support_mail_threads WHERE id=?').bind(id).first();
}
export async function handleSupportMail(request,env,{session}={}){
 if(env.SUPPORT_MAIL_INBOX_ENABLED!=='true')return fail(404,'Not found');
 if(!storeConfigured(env)||typeof session!=='function')return fail(503,'Mailbox storage is unavailable');
 const user=await session(request,env);
 if(!owner(user,env))return fail(404,'Not found');
 const url=new URL(request.url),path=url.pathname;
 if(!['GET','POST','PATCH'].includes(request.method))return fail(405,'Method not allowed');
 if(request.method!=='GET'&&!originOK(request))return fail(403,'Invalid request origin');
 if(path==='/api/support-mail/threads'&&request.method==='GET'){
  const result=await env.AUTH_DB.prepare(
   'SELECT t.id,t.alias,t.contact_email,t.subject,t.status,t.created_at,t.updated_at,'+
   '(SELECT COUNT(*) FROM support_mail_messages m WHERE m.thread_id=t.id) AS message_count '+
   'FROM support_mail_threads t ORDER BY updated_at DESC LIMIT 100').all();
  return json({threads:result.results||[],send_enabled:env.SUPPORT_MAIL_SEND_ENABLED==='true'&&!!env.RESEND_API_KEY});
 }
 const match=path.match(/^\/api\/support-mail\/threads\/([a-f0-9-]{36})(?:\/(reply|status))?$/i);
 if(match){
  const thread=await threadRow(env.AUTH_DB,match[1]);
  if(!thread)return fail(404,'Thread not found');
  if(!match[2]&&request.method==='GET'){
   const data=await env.AUTH_DB.prepare(
    'SELECT id,direction,sender,recipient,subject,body_text,status,raw_size,created_at FROM support_mail_messages '+
    'WHERE thread_id=? ORDER BY created_at,id LIMIT 150').bind(thread.id).all();
   return json({thread,messages:data.results||[],send_enabled:env.SUPPORT_MAIL_SEND_ENABLED==='true'&&!!env.RESEND_API_KEY});
  }
  if(match[2]==='status'&&request.method==='PATCH'){
   const input=await limitedJson(request,256);
   if(!['open','closed'].includes(input.status))return fail(422,'Invalid status');
   await env.AUTH_DB.prepare('UPDATE support_mail_threads SET status=? WHERE id=?').bind(input.status,thread.id).run();
   return json({status:input.status});
  }
  if(match[2]==='reply'&&request.method==='POST')return replyToThread(request,env,thread);
 }
 const raw=path.match(/^\/api\/support-mail\/messages\/([a-f0-9-]{36})\/original$/i);
 if(raw&&request.method==='GET'){
  const record=await env.AUTH_DB.prepare('SELECT raw_key FROM support_mail_messages WHERE id=? AND direction=\'incoming\'').bind(raw[1]).first();
  if(!record?.raw_key)return fail(404,'Original message unavailable');
  const object=await env.MAIL_MESSAGES.get(record.raw_key);
  if(!object)return fail(404,'Original message unavailable');
  return new Response(object.body,{headers:{
   'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="humperdinck-message.eml"',
   'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
   'Content-Security-Policy':"default-src 'none'; sandbox"}});
 }
 return fail(404,'Not found');
}
async function replyToThread(request,env,thread){
 if(env.SUPPORT_MAIL_SEND_ENABLED!=='true'||!env.RESEND_API_KEY)return fail(503,'Outgoing mail is not configured');
 const input=await limitedJson(request,10000);
 if(typeof input.body!=='string'||input.body.trim().length<1||input.body.length>8000)
  return fail(422,'Write a message between 1 and 8,000 characters');
 if(!ALIASES.has(thread.alias)||!emailOnly(thread.contact_email))return fail(422,'Thread address is invalid');
 const recent=await env.AUTH_DB.prepare(
  "SELECT message_id FROM support_mail_messages WHERE thread_id=? AND direction='incoming' AND message_id IS NOT NULL ORDER BY created_at DESC LIMIT 1")
  .bind(thread.id).first();
 // Conservative budget: limits unexpected spam or accidental automation.
 const sent=await env.AUTH_DB.prepare(
  "SELECT COUNT(*) AS n FROM support_mail_messages WHERE direction='outgoing' AND created_at>? AND status IN ('pending','sent','unknown')"
 ).bind(now()-86400).first();
 if(Number(sent?.n||0)>=75)return fail(429,'Daily support reply limit reached');
 const id=crypto.randomUUID(),created=now();
 await env.AUTH_DB.prepare(
  'INSERT INTO support_mail_messages (id,thread_id,direction,sender,recipient,subject,body_text,message_id,in_reply_to,provider_id,raw_key,raw_size,status,created_at,updated_at) '+
  'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .bind(id,thread.id,'outgoing',thread.alias,thread.contact_email,cleanSubject(thread.subject),input.body.trim(),
   null,recent?.message_id||null,null,null,null,'pending',created,created).run();
 const headers={};
 if(messageId(recent?.message_id)){
  headers['In-Reply-To']=recent.message_id;
  headers['References']=recent.message_id;
 }
 let response;
 try{
  response=await fetch('https://api.resend.com/emails',{
   method:'POST',
   headers:{'Authorization':'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'support-mail-'+id},
   body:JSON.stringify({from:senderLabel(thread.alias),to:[thread.contact_email],reply_to:[thread.alias],
    subject:/^re:/i.test(thread.subject)?thread.subject:'Re: '+thread.subject,
    text:input.body.trim(),headers})
  });
 }catch{
  // Network errors have an ambiguous delivery result; never retry automatically.
  await env.AUTH_DB.prepare("UPDATE support_mail_messages SET status='unknown',updated_at=? WHERE id=?").bind(now(),id).run();
  return fail(502,'Delivery unconfirmed; check Resend before trying again');
 }
 if(!response.ok){
  await env.AUTH_DB.prepare("UPDATE support_mail_messages SET status='failed',updated_at=? WHERE id=?").bind(now(),id).run();
  return fail(502,'Resend did not accept this message; verify domain, quota and configuration');
 }
 const result=await response.json().catch(()=>({}));
 if(!UUID.test(result.id||'')){
  await env.AUTH_DB.prepare("UPDATE support_mail_messages SET status='unknown',updated_at=? WHERE id=?").bind(now(),id).run();
  return fail(502,'Delivery response could not be confirmed; check Resend before retrying');
 }
 await env.AUTH_DB.prepare("UPDATE support_mail_messages SET status='sent',provider_id=?,updated_at=? WHERE id=?")
  .bind(result.id,now(),id).run();
 await env.AUTH_DB.prepare('UPDATE support_mail_threads SET updated_at=? WHERE id=?').bind(now(),thread.id).run();
 return json({sent:true,id,provider_id:result.id});
}
/* Cloudflare Email Worker entrypoint.
 * Existing Cloudflare forwarding routes MUST be changed only after owner
 * configures SUPPORT_MAIL_FORWARD_TO and verifies this function in staging.
 * Forward first; a storage error must never silently drop a customer email.
 */
export async function receiveSupportMail(message,env){
 const alias=String(message.to||'').toLowerCase().trim();
 const forward=env.SUPPORT_MAIL_FORWARD_TO;
 if(!forward||!emailOnly(forward))throw Error('Mail forwarding destination is not configured');
 await message.forward(forward);
 if(!ALIASES.has(alias)||env.SUPPORT_MAIL_INBOX_ENABLED!=='true'||!storeConfigured(env))return;
 if(!Number.isFinite(message.rawSize)||message.rawSize>5*1024*1024)return;
 const sender=emailOnly(message.headers.get('reply-to'))||emailOnly(message.from);
 if(!sender||ALIASES.has(sender))return;
 const headerId=messageId(message.headers.get('message-id'));
 const candidate=inReplyTo(message.headers.get('in-reply-to'))||
  inReplyTo(message.headers.get('references'));
 const subject=cleanSubject(message.headers.get('subject'));
 const raw=new Uint8Array(await new Response(message.raw).arrayBuffer());
 if(raw.byteLength>5*1024*1024)return;
 const db=env.AUTH_DB;
 // Some providers deliver a duplicated Message-ID. Avoid duplicate conversations.
 if(headerId){
  const dup=await db.prepare('SELECT id FROM support_mail_messages WHERE recipient=? AND message_id=? AND direction=\'incoming\'').bind(alias,headerId).first();
  if(dup)return;
 }
 let existing=null;
 if(candidate){
  existing=await db.prepare(
   "SELECT t.id,t.contact_email FROM support_mail_messages m JOIN support_mail_threads t ON t.id=m.thread_id WHERE m.message_id=? AND t.alias=? LIMIT 1"
  ).bind(candidate,alias).first();
 }
 // A reference to a different sender's thread must never disclose that thread.
 const id=crypto.randomUUID(),threadId=existing?.contact_email===sender?existing.id:crypto.randomUUID(),ts=now();
 const key='inbound/'+id+'.eml';
 await env.MAIL_MESSAGES.put(key,raw,{httpMetadata:{contentType:'message/rfc822'},customMetadata:{kind:'support-original-v1'}});
 try{
  if(threadId!==existing?.id){
   await db.prepare('INSERT INTO support_mail_threads (id,alias,contact_email,subject,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .bind(threadId,alias,sender,subject,'open',ts,ts).run();
  }
  await db.prepare(
   'INSERT INTO support_mail_messages (id,thread_id,direction,sender,recipient,subject,body_text,message_id,in_reply_to,provider_id,raw_key,raw_size,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(id,threadId,'incoming',sender,alias,subject,mimeText(raw),headerId,candidate,null,key,raw.length,'received',ts,ts).run();
  await db.prepare('UPDATE support_mail_threads SET updated_at=? WHERE id=?').bind(ts,threadId).run();
 }catch(error){
  await env.MAIL_MESSAGES.delete(key).catch(()=>{});
  throw error;
 }
}
