import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleSupportMail,receiveSupportMail} from '../src/support-mail.js';
import {mimeText} from '../src/support-mail-mime.js';
globalThis.crypto ||= webcrypto;
const base='https://humperdinck.studio';
const owner='c799ae74-14d8-4b38-93da-9bfc4781db22';
const threadId='5aaa3cb0-4d8b-4380-927a-06cdd1340a48';
const mkReq=(path,method='GET',body=null,origin=base)=>new Request(base+path,{method,
 headers:{Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
const asOwner=async()=>({id:owner,kind:'web'});
const r2=()=>{const values=new Map();return {
 values,put:async(k,v)=>{values.set(k,v)},get:async(k)=>({body:values.get(k)}),
 delete:async k=>{values.delete(k)}
}};
const db=()=>{const threads=[],messages=[];return {
 threads,messages,async batch(items){for(const item of items)await item.run();return items.map(()=>({success:true}));},prepare(sql){return {async first(){if(sql.includes('COALESCE(SUM(raw_size),0)'))return {bytes:messages.filter(m=>m.direction==='incoming').reduce((n,m)=>n+(m.raw_size||0),0)};throw Error('Unmocked unbound first '+sql);},async all(){if(sql.includes('FROM support_mail_threads t'))return {results:threads};throw Error('Unmocked unbound all '+sql);},bind(...a){return {
  async first(){
   if(sql.includes('FROM support_mail_threads WHERE id=?'))return threads.find(t=>t.id===a[0])||null;
   if(sql.includes('WHERE recipient=? AND message_id=?'))return messages.find(m=>m.recipient===a[0]&&m.message_id===a[1])||null;
   if(sql.includes('JOIN support_mail_threads t'))return null;
   if(sql.includes('COUNT(*) AS n'))return {n:0};
   if(sql.includes("WHERE thread_id=? AND direction='incoming'"))return messages.find(m=>m.thread_id===a[0]&&m.message_id)||null;
   throw Error('Unmocked first '+sql);
  },
  async all(){
   if(sql.includes('FROM support_mail_threads t'))return {results:threads};
   if(sql.includes('FROM support_mail_messages'))return {results:messages.filter(m=>m.thread_id===a[0])};
   throw Error('Unmocked all '+sql);
  },
  async run(){
   if(sql.startsWith('INSERT INTO support_mail_threads')){
    const [id,alias,contact_email,subject,status,created_at,updated_at]=a;
    threads.push({id,alias,contact_email,subject,status,created_at,updated_at});return {meta:{changes:1}};
   }
   if(sql.startsWith('INSERT INTO support_mail_messages')){
    const [id,thread_id,direction,sender,recipient,subject,body_text,message_id,in_reply_to,provider_id,raw_key,raw_size,status,created_at,updated_at]=a;
    messages.push({id,thread_id,direction,sender,recipient,subject,body_text,message_id,in_reply_to,provider_id,raw_key,raw_size,status,created_at,updated_at});return {meta:{changes:1}};
   }
   if(sql.startsWith('UPDATE support_mail_threads')){
    const row=threads.find(t=>t.id===a.at(-1));if(row)row.updated_at=a[0];return {meta:{changes:1}};
   }
   if(sql.startsWith('UPDATE support_mail_messages'))return {meta:{changes:1}};
   throw Error('Unmocked write '+sql);
  }
 };}}}
}};
test('MIME preview extracts text safely from quoted-printable multipart',()=>{
 const raw=['MIME-Version: 1.0','Content-Type: multipart/alternative; boundary="abc"','','--abc',
  'Content-Type: text/plain; charset=utf-8','Content-Transfer-Encoding: quoted-printable','','Hello=2C support!',
  '--abc','Content-Type: text/html','','<script>ignored()</script><p>Hello</p>','--abc--',''].join('\r\n');
 assert.equal(mimeText(new TextEncoder().encode(raw)).trim(),'Hello, support!');
});
test('HTML-only MIME becomes inert text and raw markup never appears as HTML',()=>{
 const raw='Content-Type: text/html\r\n\r\n<script>alert(1)</script><p>Hi</p>';
 const output=mimeText(new TextEncoder().encode(raw));
 assert.match(output,/Hi/);assert.doesNotMatch(output,/<script>|alert/);
});
test('mail API stays inaccessible without explicit flag, even for owner',async()=>{
 const env={AUTH_DB:db(),MAIL_MESSAGES:r2(),ANALYTICS_OWNER_ACCOUNT_ID:owner};
 const response=await handleSupportMail(mkReq('/api/support-mail/threads'),env,{session:asOwner});
 assert.equal(response.status,404);
});
test('mail API requires owner web session and exact origin on mutations',async()=>{
 const env={AUTH_DB:db(),MAIL_MESSAGES:r2(),ANALYTICS_OWNER_ACCOUNT_ID:owner,SUPPORT_MAIL_INBOX_ENABLED:'true'};
 assert.equal((await handleSupportMail(mkReq('/api/support-mail/threads'),env,{session:async()=>({id:owner,kind:'desktop'})})).status,404);
 assert.equal((await handleSupportMail(mkReq('/api/support-mail/threads'),env,{session:async()=>({id:'another',kind:'web'})})).status,404);
 assert.equal((await handleSupportMail(mkReq('/api/support-mail/threads/'+threadId+'/reply','POST',{body:'Hello'},'https://evil.invalid'),env,{session:asOwner})).status,403);
 assert.equal((await handleSupportMail(mkReq('/api/support-mail/threads'),env,{session:asOwner})).status,200);
});
test('inbound forwards to Gmail then stores private MIME and thread',async()=>{
 const storage=r2(),database=db();
 const env={SUPPORT_MAIL_INBOX_ENABLED:'true',SUPPORT_MAIL_FORWARD_TO:'backup@example.com',MAIL_MESSAGES:storage,AUTH_DB:database};
 const raw=['From: customer@example.com','To: support@humperdinck.studio','Subject: Help','Message-ID: <abc123@example.com>','','Hello team'].join('\r\n');
 let forwarded=0;
 const message={to:'support@humperdinck.studio',from:'customer@example.com',rawSize:raw.length,
  raw:new Response(raw).body,headers:new Headers({'subject':'Help','message-id':'<abc123@example.com>'}),
  async forward(to){assert.equal(to,'backup@example.com');forwarded++}};
 await receiveSupportMail(message,env);
 assert.equal(forwarded,1);assert.equal(database.threads.length,1);
 assert.equal(database.messages.length,1);
 assert.match(database.messages[0].body_text,/Hello team/);
 assert.equal(storage.values.size,1);
});
test('missing forward address does not consume or silently drop incoming email',async()=>{
 const env={SUPPORT_MAIL_INBOX_ENABLED:'true',AUTH_DB:db(),MAIL_MESSAGES:r2()};
 await assert.rejects(receiveSupportMail({to:'support@humperdinck.studio',headers:new Headers()},env));
});
test('feature off still forwards to Gmail but does not store private data',async()=>{
 const database=db(),storage=r2();let forwarded=false;
 await receiveSupportMail({to:'support@humperdinck.studio',async forward(){forwarded=true;}},{
  SUPPORT_MAIL_FORWARD_TO:'backup@example.com',AUTH_DB:database,MAIL_MESSAGES:storage
 });
 assert.equal(forwarded,true);assert.equal(database.threads.length,0);assert.equal(storage.values.size,0);
});

test('archive storage failure after forwarding cannot make email forward twice',async()=>{
 let forwards=0;
 const env={SUPPORT_MAIL_INBOX_ENABLED:'true',SUPPORT_MAIL_FORWARD_TO:'backup@example.com',
  MAIL_MESSAGES:{async put(){throw Error('R2 unavailable')}},
  AUTH_DB:db()};
 const original=console.error;console.error=()=>{};
 try{
  const payload='Subject: Help\r\nMessage-ID: <id@example.com>\r\n\r\nPlease assist';
  await receiveSupportMail({to:'support@humperdinck.studio',from:'client@example.com',
   headers:new Headers({'Subject':'Help','Message-ID':'<id@example.com>'}),raw:new Response(payload).body,
   rawSize:payload.length,async forward(){forwards++}},env);
 }finally{console.error=original}
 assert.equal(forwards,1);
});
