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