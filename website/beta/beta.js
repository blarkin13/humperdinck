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
  $('feedback-form').hidden=data.canSubmit!==true;
  if(data.canSubmit!==true){
   $('state').hidden=false;
   $('state').textContent='An active beta invitation is required to submit feedback. Existing reports remain accessible below.';
  }
  state.isOwner=data.isOwner===true;state.reports=data.reports||[];
  $('review').hidden=!state.isOwner;
  renderReports();
  if(state.isOwner){await loadGrants();await loadInvitations();}
  else if(data.canSubmit!==true)await checkInvitations();
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
async function checkInvitations(){
 $('invite-claim-panel').hidden=true;
 try{
  const data=await api('/invitations/status');
  $('invite-claim-panel').hidden=!data.invited;
 }catch{}
}
$('claim-invite').addEventListener('click',async()=>{
 const button=$('claim-invite');button.disabled=true;
 $('claim-result').textContent='Activating your invitation…';
 try{
  const data=await api('/invitations/claim',{method:'POST'});
  $('claim-result').textContent='Beta Pro active until '+new Date(data.expires_at*1000).toLocaleDateString()+'. You can now connect Humperdinck on your desktop.';
  await load();
 }catch(error){$('claim-result').textContent=error.message;}
 finally{button.disabled=false;}
});
const inviteDraft=(email,url)=>{
 return 'You are invited to test Humperdinck!\n\n'+
 'Please open '+url+' and sign in with this Google account: '+email+'\n\n'+
 'After signing in, select “Activate 30-day Pro” in the Beta Feedback page. '+
 'This gives you temporary Pro access for 30 days, starting when you activate it. '+
 'The invitation itself expires in 14 days. Beta software may have bugs. '+
 'Please submit only your own or permitted voice recordings and remove personal details from screenshots.\n\n'+
 'We welcome candid feedback, not positive reviews. Privacy: https://humperdinck.studio/privacy/\n'+
 'For help: support@humperdinck.studio';
};
async function loadInvitations(){
 const list=$('invite-list');list.replaceChildren();
 try{
  const data=await api('/admin/invitations');
  for(const item of data.invitations||[]){
   const row=el('div',null,'grant-row');
   const status=item.revoked_at?'Revoked':item.accepted_at?'Claimed':item.expires_at<=Date.now()/1000?'Expired':'Awaiting sign-in';
   row.append(el('strong',item.email),el('span',status+' · Invitation expires '+new Date(item.expires_at*1000).toLocaleDateString(),'status'));
   if(status==='Awaiting sign-in'){
    const revoke=el('button','Cancel invitation');revoke.type='button';
    revoke.addEventListener('click',async()=>{
     if(!confirm('Cancel this unclaimed beta invitation?'))return;
     revoke.disabled=true;
     try{await api('/admin/invitations/'+item.id+'/revoke',{method:'POST'});await loadInvitations();}
     catch(error){$('invite-result').textContent=error.message;}
     finally{revoke.disabled=false;}
    });row.append(revoke);
   }
   list.append(row);
  }
  if(!data.invitations?.length)list.append(el('p','No invitations created yet.','muted'));
 }catch(error){$('invite-result').textContent='Could not load invitations: '+error.message;}
}
$('invite-form').addEventListener('submit',async event=>{
 event.preventDefault();
 const button=event.currentTarget.querySelector('button');button.disabled=true;
 $('invite-result').textContent='Creating invitation…';
 try{
  const email=$('invite-email').value.trim().toLowerCase();
  const data=await api('/admin/invitations',{method:'POST',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});
  const body=inviteDraft(data.email,data.invitation_url);
  $('invite-compose').hidden=false;
  $('invite-message').value=body;
  $('email-invitation').href='mailto:'+encodeURIComponent(data.email)+
   '?subject='+encodeURIComponent('Invitation to test Humperdinck')+
   '&body='+encodeURIComponent(body);
  $('invite-result').textContent='Invitation created. Copy or compose the email to send it. No email has been sent yet.';
  $('invite-email').value='';
  await loadInvitations();
 }catch(error){$('invite-result').textContent=error.message;}
 finally{button.disabled=false;}
});
$('copy-invitation').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText($('invite-message').value);
  $('invite-result').textContent='Invitation message copied.';}
 catch{$('invite-result').textContent='Select the invitation text above to copy it.';}
});
$('test-revoke-form').addEventListener('submit',async event=>{
 event.preventDefault();
 const email=$('test-revoke-email').value.trim().toLowerCase();
 if(!confirm('Revoke ONLY the Lemon Squeezy TEST lifetime Pro license for '+email+'? The test order is retained. Any offline certificates already exported cannot be remotely revoked.'))return;
 const button=event.currentTarget.querySelector('button');button.disabled=true;
 $('test-revoke-result').textContent='Checking test entitlement…';
 try{
  const result=await api('/admin/test-license/revoke',{method:'POST',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({email,confirm:'REVOKE TEST LICENSE'})});
  $('test-revoke-result').textContent=result.revoked?
   'Test lifetime Pro entitlement revoked. Account reverts to Free unless another Pro grant exists. Transaction history preserved.':'Unable to revoke test license.';
  $('test-revoke-email').value='';
 }catch(error){$('test-revoke-result').textContent=error.message;}
 finally{button.disabled=false;}
});
async function loadGrants(){
 const panel=$('grant-panel'),list=$('grant-list');list.replaceChildren();
 try{
  const data=await api('/admin/grants');panel.hidden=false;
  if(!data.grants.length)list.append(el('p','No beta invitations issued yet.','muted'));
  for(const grant of data.grants){
   const item=el('div',null,'grant-row');
   const status=grant.revoked_at?'Revoked':grant.expires_at<=Date.now()/1000?'Expired':'Active';
   item.append(el('strong',grant.email),el('span',status+' · Expires '+new Date(grant.expires_at*1000).toLocaleDateString(),'status'));
   if(status==='Active'){
    const revoke=el('button','Revoke future activation');revoke.type='button';
    revoke.addEventListener('click',async()=>{
     if(!confirm('Revoke future beta activations for this account? Already-issued offline trials remain usable until their signed expiry.'))return;
     revoke.disabled=true;
     try{await api('/admin/grants/'+grant.id+'/revoke',{method:'POST'});
       await loadGrants();}
     catch(error){$('grant-result').textContent=error.message;}
     finally{revoke.disabled=false;}
    });item.append(revoke);
   }
   list.append(item);
  }
 }catch(error){panel.hidden=true;}
}
$('grant-form').addEventListener('submit',async event=>{
 event.preventDefault();
 const button=event.currentTarget.querySelector('button');button.disabled=true;
 $('grant-result').textContent='Checking tester account…';
 try{
  const result=await api('/admin/grants',{method:'POST',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('grant-email').value})});
  $('grant-result').textContent='Temporary Pro access granted until '+new Date(result.expires_at*1000).toLocaleDateString()+'.';
  $('grant-email').value='';await loadGrants();
 }catch(error){$('grant-result').textContent=error.message;}
 finally{button.disabled=false;}
});
$('delete-report').addEventListener('click',async()=>{
 if(!state.active||!confirm('Delete this report and every attached screenshot permanently?'))return;
 const id=state.active.id;
 try{await api('/reports/'+id,{method:'DELETE'});$('report-dialog').close();state.active=null;await load();}
 catch(error){$('dialog-message').textContent=error.message||'Could not delete report';}
});
load();
