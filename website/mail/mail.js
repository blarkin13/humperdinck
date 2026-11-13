'use strict';
// Private owner inbox. User-supplied emails are always rendered as text.
const $=id=>document.getElementById(id);
const state={threads:[],active:null,sendEnabled:false,busy:false};
const url='/api/support-mail/';
function notice(message,error=false){
 $('notice').textContent=message;
 $('notice').classList.toggle('error',error);
}
async function api(path,options={}){
 const response=await fetch(url+path,{credentials:'same-origin',cache:'no-store',
  headers:{Accept:'application/json',...(options.method?{'Content-Type':'application/json'}:{})},
  ...options});
 let data={};try{data=await response.json();}catch{}
 if(!response.ok)throw Error(data.error||'Mailbox request failed');
 return data;
}
const date=ts=>ts?new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(ts*1000)):'';
function el(tag,text,klass){
 const node=document.createElement(tag);
 if(klass)node.className=klass;
 if(text!==undefined&&text!==null)node.textContent=String(text);
 return node;
}
function filtered(){
 const needle=$('search').value.toLowerCase().trim();
 const alias=$('alias-filter').value;
 return state.threads.filter(t=>(!alias||t.alias===alias)&&(!needle||
  [t.subject,t.contact_email,t.alias].some(x=>String(x||'').toLowerCase().includes(needle))));
}
function renderList(){
 const box=$('threads');box.replaceChildren();
 const items=filtered();
 $('count').textContent=items.length+' shown';
 for(const t of items){
  const b=el('button',undefined,'thread'+(state.active===t.id?' active':''));
  b.type='button';b.setAttribute('role','listitem');
  b.setAttribute('aria-pressed',String(state.active===t.id));
  b.append(el('strong',t.subject),el('small',t.contact_email),
   el('span',t.alias+' · '+(t.status==='closed'?'Closed':'Open'),'thread-meta'),
   el('time',date(t.updated_at),'thread-time'));
  b.addEventListener('click',()=>openThread(t.id));
  box.append(b);
 }
 if(!items.length)box.append(el('p','No matching conversations yet.','no-results'));
}
async function loadList(){
 $('refresh').disabled=true;
 try{
  const data=await api('threads');
  state.threads=data.threads||[];
  state.sendEnabled=Boolean(data.send_enabled);
  $('mail-workspace').hidden=false;
  renderList();
  notice(state.sendEnabled?'Inbox ready. Outgoing replies available.':
   'Inbox ready. Sending remains disabled until Resend is verified.');
  if(state.active&&state.threads.some(x=>x.id===state.active))await openThread(state.active);
 }catch(error){
  if(/Not found|Sign in/.test(error.message)){
   $('mail-workspace').hidden=true;
   notice('This inbox is available only to the signed-in Humperdinck owner after activation. Open My account to sign in.',true);
  }else notice(error.message,true);
 }finally{$('refresh').disabled=false}
}
async function openThread(id){
 state.active=id;
 renderList();
 try{
  const data=await api('threads/'+id);
  const t=data.thread;
  $('empty').hidden=true;$('thread-view').hidden=false;
  // If the user previously scrolled to the end of the pane, show its header.
  document.querySelector('.conversation').scrollTop=0;
  $('thread-address').textContent=t.alias+' · '+t.status;
  $('thread-subject').textContent=t.subject;
  $('thread-contact').textContent=t.contact_email;
  $('reply-from').textContent=t.alias;
  $('close-thread').textContent=t.status==='closed'?'Reopen thread':'Close thread';
  $('close-thread').disabled=false;
  $('send').disabled=!state.sendEnabled;
  $('reply').disabled=!state.sendEnabled;
  $('reply-help').textContent=state.sendEnabled?
   'Replies will be sent through Resend.':'Replies remain disabled until Resend is configured.';
  $('messages').replaceChildren();
  for(const m of data.messages){
   const article=el('article',undefined,'message '+(m.direction==='outgoing'?'outgoing':'incoming'));
   const top=el('div',undefined,'message-top');
   top.append(el('strong',m.direction==='outgoing'?'You · '+m.sender:m.sender),
    el('time',date(m.created_at)));
   article.append(top,el('p','To: '+m.recipient+' · '+m.status,'message-meta'),
    el('pre',m.body_text||'(No text preview)'));
   if(m.direction==='incoming'&&m.raw_size){
    const link=el('a','Download original (.eml)','original');
    link.href=url+'messages/'+encodeURIComponent(m.id)+'/original';
    link.rel='noreferrer';article.append(link);
   }
   $('messages').append(article);
  }
 }catch(error){
  // The global status line may be off-screen. Show errors where the thread
  // should have opened so a failed click is never mistaken for a dead button.
  $('thread-view').hidden=true;
  $('empty').hidden=false;
  $('empty').textContent='Unable to open this conversation: '+error.message;
  $('empty').setAttribute('role','alert');
  notice(error.message,true);
 }
}
$('reply-form').addEventListener('submit',async event=>{
 event.preventDefault();
 if(state.busy||!state.active)return;
 const body=$('reply').value.trim();
 if(!body)return;
 state.busy=true;$('send').disabled=true;notice('Sending reply…');
 try{
  await api('threads/'+state.active+'/reply',{method:'POST',body:JSON.stringify({body})});
  $('reply').value='';
  notice('Resend accepted the reply.');
  await loadList();
 }catch(error){notice(error.message,true)}
 finally{state.busy=false;$('send').disabled=!state.sendEnabled}
});
$('close-thread').addEventListener('click',async()=>{
 if(!state.active)return;
 const current=state.threads.find(x=>x.id===state.active);
 if(!current)return;
 $('close-thread').disabled=true;
 try{
  await api('threads/'+state.active+'/status',{method:'PATCH',
   body:JSON.stringify({status:current.status==='closed'?'open':'closed'})});
  await loadList();
 }catch(error){notice(error.message,true);$('close-thread').disabled=false}
});
$('refresh').addEventListener('click',loadList);
$('search').addEventListener('input',renderList);
$('alias-filter').addEventListener('change',renderList);
loadList();
