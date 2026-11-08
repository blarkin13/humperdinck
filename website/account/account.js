'use strict';
const q=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const device=params.get('device');
const validDevice=typeof device==='string' && /^[A-Z2-7]{10}$/.test(device);
const returnTo=validDevice?'/account/?device='+device:'/account/';
const message=(status,title,body)=>{
  q('account-state').textContent=status;q('account-title').textContent=title;q('account-message').textContent=body;
};
async function load(){
  if(params.get('error'))message('Error','Sign-in incomplete','Authentication could not be completed. You can try again.');
  let config;
  try{
    const response=await fetch('/api/account/config',{cache:'no-store'});
    if(!response.ok)throw Error('Account service unavailable');
    config=await response.json();
  }catch{message('Offline','Accounts unavailable','You can continue using all local Free features without signing in.');return}
  if(!config.available || !Object.values(config.providers||{}).some(Boolean)){
    message('Not active','Accounts coming soon','Account infrastructure is prepared, but sign-in has not been activated. Free remains available without an account.');
    return;
  }
  try{
    const response=await fetch('/api/account/me',{cache:'no-store'});
    if(!response.ok)throw Error('Account service unavailable');
    const state=await response.json();
    if(state.authenticated){
      message('Connected','Your account','Account details and desktop connections.');
      q('profile').hidden=false;
      q('account-name').textContent=state.user.display_name||'Humperdinck user';
      q('account-email').textContent=state.user.email||'Private email';
      await loadLicenseDashboard();
      if(validDevice){
        q('pairing').hidden=false;
        q('device-code').textContent=device.slice(0,5)+'-'+device.slice(5);
      }
    }else{
      message('Sign in','Sign in to Humperdinck','Choose a provider to connect an account. No login is required for the Free desktop app.');
      q('providers').hidden=false;
      for(const provider of ['google','apple']){
        const button=q(provider+'-login');
        if(config.providers?.[provider]){
          button.hidden=false;
          button.href='/api/account/start/'+provider+'?return_to='+encodeURIComponent(returnTo);
        }
      }
    }
  }catch{message('Unavailable','Account service unavailable','Please try again when the service is online. Your local Free studios still work.')}
}
q('logout').addEventListener('click',async()=>{
  try{
    const r=await fetch('/api/account/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});
    if(!r.ok)throw Error();
    location.href='/account/';
  }catch{message('Error','Could not sign out','Please try again.')}
});
q('approve').addEventListener('click',async()=>{
  if(!validDevice)return;
  q('approve').disabled=true;
  q('pair-result').textContent='Connecting…';
  try{
    const r=await fetch('/api/account/device/approve',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:device})});
    if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(d.error||'This request has expired. Restart sign-in from the app.')}
    q('pair-result').textContent='This computer is connected. Return to Humperdinck.';
    q('approve').hidden=true;
  }catch(error){q('pair-result').textContent=error.message;q('approve').disabled=false}
});
load();

async function loadLicenseDashboard(){
 const dashboard=q('license-dashboard');
 if(!dashboard)return;
 try{
  const r=await fetch('/api/account/license',{cache:'no-store',credentials:'same-origin'});
  if(!r.ok)throw Error('Could not retrieve license status');
  const state=await r.json();
  const isPro=state.plan==='pro'&&state.license?.lifetime===true;
  q('account-plan').textContent=isPro?'Pro · Lifetime':'Free';
  q('account-plan-desc').textContent=isPro?'Permanent, exportable offline license':'One-time Pro purchasing and activation are coming later.';
  dashboard.hidden=!isPro;
  if(!isPro)return;
  const active=Number(state.active_devices||0),max=Number(state.device_limit||10);
  q('license-summary').textContent=active+' of '+max+' online device slots in use.';
  q('download-license').hidden=!state.license.backup_available;
  const list=q('device-list');
  list.replaceChildren();
  for(const device of state.devices||[]){
   const row=document.createElement('div');row.className='license-device';
   const info=document.createElement('div');info.className='license-device-info';
   const name=document.createElement('strong');name.textContent=device.label||'Humperdinck installation';
   const status=document.createElement('small');status.textContent=device.active?'Active device':'Deactivated';
   info.append(name,status);
   row.append(info);
   if(device.active){
    const button=document.createElement('button');button.type='button';button.className='secondary';
    button.textContent='Deactivate';button.setAttribute('aria-label','Deactivate '+name.textContent);
    button.addEventListener('click',async()=>{
      if(!confirm('Release this device slot? Previously exported offline Pro licenses on that computer cannot be remotely disabled.'))return;
      button.disabled=true;
      try{
       const r=await fetch('/api/account/license/devices/'+encodeURIComponent(device.id)+'/deactivate',{
        method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:'{}'});
       if(!r.ok){const data=await r.json().catch(()=>({}));throw Error(data.error||'Unable to deactivate device')}
       await loadLicenseDashboard();
      }catch(error){alert(error.message);button.disabled=false}
    });
    row.append(button);
   }
   list.append(row);
  }
  if(active>=8)q('license-summary').textContent+=' Consider deactivating unused devices before adding more.';
 }catch(error){
  dashboard.hidden=false;
  q('license-summary').textContent='Account license details unavailable: '+error.message;
  q('download-license').hidden=true;
 }
}
q('download-license').addEventListener('click',async()=>{
 const button=q('download-license');button.disabled=true;
 try{
  const r=await fetch('/api/account/license/backup',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(d.error||'Could not download backup')}
  const data=await r.json();
  const blob=new Blob([JSON.stringify({format:data.format,license:data.license},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  try{
   const a=document.createElement('a');a.href=url;a.download='humperdinck-pro-license.json';
   document.body.append(a);a.click();a.remove();
  }finally{setTimeout(()=>URL.revokeObjectURL(url),3000)}
 }catch(error){alert(error.message)}
 finally{button.disabled=false}
});
