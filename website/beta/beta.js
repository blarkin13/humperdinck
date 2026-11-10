'use strict';
const $=id=>document.getElementById(id);
const state={isOwner:false,reports:[],active:null,images:[]};
const MAX=2*1024*1024;
const message=(s)=>{$('state').textContent=s};
async function api(path,options={}){
 const response=await fetch('/api/beta'+path,{credentials:'same-origin',cache:'no-store',
  headers:{Accept:'application/json',...(options.headers||{})},...options});
 let data={};try{data=await response.json()}catch{}
 if(!response.ok){const error=Error(data.error||'Request failed');error.status=response.status;throw error;}
 return data;
}
const el=(tag,content,className)=>{
 const node=document.createElement(tag);if(content!=null)node.textContent=content;
 if(className)node.className=className;return node;
};
function labelStatus(status){return ({open:'Open',investigating:'Investigating',fixed:'Fixed',closed:'Closed'})[status]||'Open'}
async function load(){
 try{
  const data=await api('/reports');
  $('content').hidden=false;$('state').hidden=true;
  state.isOwner=data.isOwner===true;state.reports=data.reports||[];
  $('review').hidden=!state.isOwner;
  renderReports();
 }catch(error){
  $('content').hidden=true;$('state').hidden=false;
  $('state').replaceChildren();
  if(error.status===401){
   $('state').append(el('span','Sign in with your Humperdinck account to share beta feedback. '));
   const link=el('a','Open account sign-in');link.href='/account/';$('state').append(link);
  }else if(error.status===404)message('Beta feedback is not yet open. Check back after the beta invitation.');
  else message('Feedback is temporarily unavailable. Contact support@humperdinck.studio if needed.');
 }
}
function renderReports(){
 const list=$('reports');list.replaceChildren();
 if(!state.reports.length){list.append(el('p','No feedback has been submitted yet.','muted'));return;}
 for(const report of state.reports){
  const b=el('button',null,'report');b.type='button';
  b.append(el('strong',report.summary),el('span',labelStatus(report.status)+' · '+report.platform+' · '+new Date(report.created_at*1000).toLocaleDateString(),'status'));
  b.addEventListener('click',()=>openReport(report.id));list.append(b);
 }
}
async function openReport(id){
 const d=$('report-dialog');$('report-images').replaceChildren();$('dialog-message').textContent='';
 try{
  const data=await api('/reports/'+id);state.active=data.report;
  $('dialog-title').textContent=data.report.summary;
  $('report-body').textContent=data.report.details;
  $('owner-actions').hidden=!state.isOwner;
  if(state.isOwner)$('new-status').value=data.report.status;
  d.showModal();
  for(const pic of data.screenshots||[]){
   // Authenticated same-origin image endpoint; URL never contains storage object keys.
   const url='/api/beta/reports/'+encodeURIComponent(id)+'/screenshots/'+encodeURIComponent(pic.id);
   const link=el('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';
   const img=el('img');img.alt='Private screenshot attached to report';img.loading='lazy';img.src=url;
   link.append(img);$('report-images').append(link);
  }
 }catch{d.close();$('result').textContent='Could not open that report.';}
}
$('screenshots').addEventListener('change',()=>{
 const files=[...$('screenshots').files];
 const invalid=files.length>3||files.some(f=>f.type!=='image/png'||f.size>MAX);
 const list=$('image-list');list.replaceChildren();
 if(invalid){list.append(el('li','Choose up to three PNG files, each 2 MB or less.'));return;}
 files.forEach(f=>list.append(el('li',f.name+' ('+Math.ceil(f.size/1024)+' KB)')));
});
$('feedback-form').addEventListener('submit',async event=>{
 event.preventDefault();
 const files=[...$('screenshots').files];
 if(files.length>3||files.some(f=>f.type!=='image/png'||f.size>MAX)){
  $('result').textContent='Please choose up to 3 PNG screenshots, 2 MB each.';return;
 }
 const send=$('send');send.disabled=true;$('result').textContent='Submitting…';
 try{
  const data=await api('/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
   category:document.querySelector('input[name="category"]:checked').value,
   platform:$('platform').value,area:$('area').value,summary:$('summary').value,
   details:$('details').value,privacyConfirmed:$('privacy').checked
  })});
  let failures=0;
  for(const file of files){
   try{await api('/reports/'+data.id+'/screenshots',{method:'POST',
     headers:{'Content-Type':'image/png'},body:file});}catch{failures++;}
  }
  $('result').textContent='Feedback saved. Reference: '+data.id+
   (failures?' — '+failures+' screenshot(s) could not upload; please contact support.':'');
  $('feedback-form').reset();$('image-list').replaceChildren();
  await load();
 }catch(error){$('result').textContent=error.message||'Submission failed. Please try again.';}
 finally{send.disabled=false;}
});
$('save-status').addEventListener('click',async()=>{
 if(!state.isOwner||!state.active)return;
 const b=$('save-status');b.disabled=true;
 try{
  await api('/reports/'+state.active.id,{method:'PATCH',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({status:$('new-status').value})});
  $('dialog-message').textContent='Status updated.';
  await load();
 }catch(error){$('dialog-message').textContent=error.message;}
 finally{b.disabled=false;}
});
$('delete-report').addEventListener('click',async()=>{
 if(!state.active||!confirm('Delete this report and every attached screenshot permanently?'))return;
 const id=state.active.id;
 try{await api('/reports/'+id,{method:'DELETE'});$('report-dialog').close();state.active=null;await load();}
 catch(error){$('dialog-message').textContent=error.message||'Could not delete report';}
});
load();
