import React,{useEffect,useRef,useState} from 'react';
import './AccountPanel.css';

async function localApi(path,method='GET',body){
 const response=await fetch('/api/'+path,{method,
  headers:{'Accept':'application/json','Content-Type':'application/json'},
  ...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:(data.error||'Account service unavailable'));
 return data;
}
function deviceCode(url){
 const code=/[?&]device=([A-Z2-7]{10})/.exec(url||'')?.[1];
 return code?code.slice(0,5)+'-'+code.slice(5):'';
}
function saveFile(filename,value){
 const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob);
 try{const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove()}
 finally{setTimeout(()=>URL.revokeObjectURL(url),3000)}
}

/** Free uses no cloud login. Verified lifetime certificates work even offline. */
export default function AccountPanel({onClose,onLicenseChange=()=>{},onAccountChange=()=>{}}){
 const [account,setAccount]=useState(null),[pending,setPending]=useState(null);
 const [license,setLicense]=useState({plan:'free'}),[error,setError]=useState('');
 const [message,setMessage]=useState(''),[working,setWorking]=useState(false);
 const fileRef=useRef(null);
 function refresh(){
  // Resume a sign-in still waiting in the browser; otherwise confirm the
  // saved session with the server (signs out here if revoked online).
  localApi('account/connect/status').then(r=>{
   if(r.pending){setPending(p=>p||{verification_url:r.verification_url});return}
   return localApi('account?verify=true').then(a=>{setAccount(a);onAccountChange(a);
    if(a.revoked)setMessage('This computer was signed out from your account dashboard. Your installed edition is unchanged.')});
  }).catch(e=>setError(e.message));
  localApi('license').then(setLicense).catch(e=>setError(e.message));
 }
 useEffect(()=>{refresh()},[]);
 useEffect(()=>{
  if(!pending)return;
  let alive=true;
  const interval=setInterval(async()=>{
   try{
    const result=await localApi('account/connect/status');
    if(!alive)return;
    if(!result.pending){
     setPending(null);setAccount(result);onAccountChange(result);
     const next=await localApi('license');
     if(alive){setLicense(next);onLicenseChange()}
     if(result.expired)setError('Connection expired. Start sign-in again.');
    }
   }catch(e){if(alive){setPending(null);setError(e.message)}}  // 5xx/429 come back as {pending:true}, so this is a real failure
  },2500);
  return ()=>{alive=false;clearInterval(interval)};
 },[pending]);
 async function run(callback){
  setWorking(true);setError('');setMessage('');
  try{await callback()}catch(e){setError(e.message)}finally{setWorking(false)}
 }
 // The desktop window ignores new-window links, so the backend opens the system browser.
 function openPage(event,page){event.preventDefault();localApi('account/open/'+page,'POST').catch(e=>setError(e.message))}
 function connect(){return run(async()=>setPending(await localApi('account/connect','POST')))}
 function signOut(){return run(async()=>{
  const result=await localApi('account/disconnect','POST');
  setAccount(result);onAccountChange(result);
  if(!result.online_session_revoked)setMessage('Signed out locally; the remote session may remain valid until expiry.');
 })}
 function activate(){return run(async()=>{
  const result=await localApi('license/activate','POST');
  setLicense(await localApi('license'));onLicenseChange();
  setMessage(result.warning||'Pro activated. Your permanent license is available offline. Export a backup.');
 })}
 function exportLicense(){return run(async()=>{
  const backup=await localApi('license/export');
  saveFile('humperdinck-pro-license.json',backup);
  setMessage('Portable offline backup downloaded. Keep it in a safe place.');
 })}
 async function importLicense(file){
  if(!file)return;
  await run(async()=>{
   if(file.size>30000)throw Error('License file is too large');
   const data=JSON.parse(await file.text());
   if(typeof data.license!=='string')throw Error('This file is not a Humperdinck license backup');
   await localApi('license/import','POST',{license:data.license});
   setLicense(await localApi('license'));onLicenseChange();
   setMessage('Signed lifetime Pro license verified and restored. No internet connection required.');
  });
  if(fileRef.current)fileRef.current.value='';
 }
 const connected=Boolean(account?.connected),pro=license?.plan==='pro';
 return <div className="account-panel-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <section className="account-panel" role="dialog" aria-modal="true" aria-label="Humperdinck account and license">
   <div className="account-panel-title"><div><small>HUMPERDINCK</small><h2>My account</h2></div>
   <button className="account-panel-close" type="button" onClick={onClose} aria-label="Close account"><i className="fa-solid fa-xmark"/></button></div>
   <div className="account-panel-body">
    {connected?<><span className="account-panel-status"><i className="fa-solid fa-circle-check"/> Account connected</span>
      <strong className="account-panel-user">{account.user?.display_name||account.user?.email||'Humperdinck user'}</strong>
      {account.user?.email&&<span className="account-panel-email">{account.user.email}</span>}
      <button type="button" className="account-panel-secondary" disabled={working} onClick={signOut}>Sign out of this computer</button>
     </>:<><p>Sign in to connect your purchase and manage online device activations. Free narration never requires a login.</p>
      {pending?<><div className="account-panel-pending"><i className="fa-solid fa-circle-notch fa-spin"/> Waiting for your browser…</div>
       <ol className="account-panel-steps"><li>Sign in on the page that opened.</li><li>Click <b>Approve connection</b>{deviceCode(pending.verification_url)&&<> for code <b className="account-panel-code">{deviceCode(pending.verification_url)}</b></>}.</li><li>Come back here; this finishes by itself.</li></ol>{pending.verification_url&&<a target="_blank" rel="noopener noreferrer" href={pending.verification_url} onClick={e=>openPage(e,'signin')}>{pending.browser_opened===false?'Your browser did not open. Open the sign-in page':'Open the sign-in page again'}</a>}</>
      :<button type="button" disabled={working} onClick={connect}><i className={'fa-solid '+(working?'fa-spinner fa-spin':'fa-arrow-up-right-from-square')}/> {working?'Connecting…':'Sign in using browser'}</button>}
     </>}
   </div>
   <div className="account-panel-license">
    <div className="account-panel-feature"><span>Installed edition</span><b>{pro?'Pro · Lifetime':'Free'}</b></div>
    {pro?<><p><i className="fa-solid fa-shield-halved"/> Pro verified with an offline digital signature. Your features remain available without signing in.</p>
      <button type="button" disabled={working} onClick={exportLicense}><i className="fa-solid fa-download"/> Export permanent license backup</button>
     </>:<><p>All Free studios and exports remain available. Pro is a one-time lifetime purchase; no subscription.</p>
      <button type="button" disabled={working} onClick={e=>openPage(e,'purchase')}><i className="fa-solid fa-arrow-up-right-from-square"/> Get Pro on humperdinck.studio</button>
      {connected&&<button type="button" className="account-panel-secondary" disabled={working} onClick={activate}>Activate an existing Pro purchase</button>}
     </>}
    <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={e=>importLicense(e.target.files?.[0])}/>
    <button type="button" className="account-panel-secondary" disabled={working} onClick={()=>fileRef.current?.click()}>
      <i className="fa-solid fa-file-import"/> Restore offline license backup
    </button>
    <p className="account-panel-footnote">Portable certificates survive reinstalls and account outages. Online activation tracks up to 10 devices; offline backups cannot be remotely revoked.</p>
   </div>
   {error&&<p className="account-panel-error" role="alert">{error}</p>}
   {message&&<p className="account-panel-success" role="status">{message}</p>}
   <a href="https://humperdinck.studio/account/" target="_blank" rel="noopener noreferrer" className="account-panel-website" onClick={e=>openPage(e,'dashboard')}>Manage account and devices <i className="fa-solid fa-arrow-up-right-from-square"/></a>
  </section></div>;
}
