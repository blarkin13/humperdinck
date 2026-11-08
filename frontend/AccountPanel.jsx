import React,{useEffect,useState} from 'react';
import './AccountPanel.css';

async function localApi(path,method='GET'){
 const response=await fetch('/api/account'+path,{method,headers:{'Accept':'application/json','Content-Type':'application/json'}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'Account service unavailable');
 return data;
}

/** Optional customer sign-in. Free voice work never calls the cloud service. */
export default function AccountPanel({onClose}){
 const [account,setAccount]=useState(null),[pending,setPending]=useState(null),[error,setError]=useState('');
 const [working,setWorking]=useState(false);
 useEffect(()=>{localApi('').then(setAccount).catch(e=>setError(e.message));},[]);
 useEffect(()=>{
  if(!pending)return;
  let alive=true;
  const interval=setInterval(async()=>{
   try{
    const result=await localApi('/connect/status');
    if(!alive)return;
    if(!result.pending){
     setPending(null);
     setAccount(result);
     if(result.expired)setError('Connection expired. Start sign-in again.');
    }
   }catch(e){if(alive){setPending(null);setError(e.message)}}
  },2500);
  return ()=>{alive=false;clearInterval(interval)};
 },[pending]);
 async function connect(){
  setWorking(true);setError('');
  try{
   const result=await localApi('/connect','POST');
   setPending(result);
  }catch(e){setError(e.message)}finally{setWorking(false)}
 }
 async function signOut(){
  setWorking(true);setError('');
  try{
   const result=await localApi('/disconnect','POST');
   setAccount(result);
   if(!result.online_session_revoked)setError(result.message||'Signed out on this computer.');
  }catch(e){setError(e.message)}finally{setWorking(false)}
 }
 return <div className="account-panel-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
 <section className="account-panel" role="dialog" aria-modal="true" aria-label="Humperdinck account">
  <div className="account-panel-title"><div><small>HUMPERDINCK</small><h2>My account</h2></div><button className="account-panel-close" type="button" onClick={onClose} aria-label="Close account"><i className="fa-solid fa-xmark"/></button></div>
  {account?.connected?<div className="account-panel-body">
    <span className="account-panel-status"><i className="fa-solid fa-circle-check"/> Connected</span>
    <strong className="account-panel-user">{account.user?.display_name||account.user?.email||'Humperdinck user'}</strong>
    {account.user?.email&&<span className="account-panel-email">{account.user.email}</span>}
    <div className="account-panel-feature"><span>Account</span><b>Connected</b></div>
    <div className="account-panel-feature"><span>Local software</span><b>Free by default</b></div>
    <p>Your local projects and voices stay on this computer. This account does not activate Pro; purchases and offline licensing are coming later.</p>
    <button type="button" className="account-panel-secondary" disabled={working} onClick={signOut}>Sign out of this computer</button>
  </div>:<div className="account-panel-body">
    <p>Connect an account for future purchases and device management. Humperdinck Free works without signing in.</p>
    {pending?<><div className="account-panel-pending"><i className="fa-solid fa-circle-notch fa-spin"/> Complete sign-in in your browser…</div><a target="_blank" rel="noopener noreferrer" href={pending.verification_url}>Open account confirmation</a></>
    :<button type="button" disabled={working} onClick={connect}><i className={'fa-solid '+(working?'fa-spinner fa-spin':'fa-arrow-up-right-from-square')}/> {working?'Connecting…':'Sign in using browser'}</button>}
    <p className="account-panel-footnote">Google and Apple login become available after the account service is configured. No password is entered in the desktop app.</p>
  </div>}
  {error&&<p className="account-panel-error" role="alert">{error}</p>}
  <a href="https://humperdinck.studio/account/" target="_blank" rel="noopener noreferrer" className="account-panel-website">Visit account website <i className="fa-solid fa-arrow-up-right-from-square"/></a>
 </section></div>;
}
