import {useDialogFocus} from './useDialogFocus.js';
import React,{useEffect,useState} from 'react';

const STATE_TEXT={online:'On · ready on your other devices',connecting:'Connecting…',signed_out:'Waiting for sign-in',error:'Problem',off:'Off'};

export default function ServerSettings({onClose,onOpenAccount}){
 const [relay,setRelay]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 const [port,setPort]=useState('0'),[saved,setSaved]=useState(''),[health,setHealth]=useState(null);
 const refresh=()=>fetch('/api/server/relay',{cache:'no-store'}).then(r=>r.json()).then(setRelay).catch(e=>setError(e.message));
 useEffect(()=>{
  refresh();
  fetch('/api/server/settings',{cache:'no-store'}).then(r=>r.json()).then(j=>setPort(String(j.preferred_port??0))).catch(()=>{});
  fetch('/api/server/status',{cache:'no-store'}).then(r=>r.json()).then(setHealth).catch(()=>{});
  const timer=setInterval(refresh,3000);
  const close=e=>{if(e.key==='Escape')onClose()};
  document.addEventListener('keydown',close);
  return()=>{clearInterval(timer);document.removeEventListener('keydown',close)};
 },[]);
 async function toggle(on){
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/server/relay/'+(on?'start':'stop'),{method:'POST'});
   const j=await r.json();
   if(!r.ok)throw Error(j.detail||'Could not change this setting');
   setRelay(j);
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function savePort(){
  const value=Number(port);
  if(!Number.isInteger(value)||(value!==0&&(value<1024||value>65535))){setError('Use Auto (0) or a port between 1024 and 65535');return}
  setError('');setSaved('');
  try{
   const r=await fetch('/api/server/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({port:value})});
   const j=await r.json();if(!r.ok)throw Error(j.detail||'Could not save');setSaved(j.message);
  }catch(e){setError(e.message)}
 }
 const on=relay?.enabled;
 const link=relay?.connect_url||'https://humperdinck.studio/connect/';
 const dialogRef=useDialogFocus();
 return <div className="server-settings-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="server-settings-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Use on other devices">
   <header><h2><i className="fa-solid fa-server" aria-hidden="true"/> Use on other devices</h2><button type="button" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark"/></button></header>
   <div className="server-mode">
    <strong><i className={'fa-solid '+(relay?.state==='online'?'fa-circle-check':'fa-mobile-screen')}/> {!relay?'Checking…':on?STATE_TEXT[relay.state]||'On':'Off'}</strong>
    <p>Open this studio on your phone, tablet or another computer, at home or away. Your voices and projects stay on this computer.</p>
    {relay&&!relay.signed_in
     ?<><p>First, sign in to your Humperdinck account on this computer.</p><button type="button" onClick={()=>{onClose();onOpenAccount?.()}}><i className="fa-regular fa-user"/> Sign in</button></>
     :<button type="button" disabled={busy||!relay} onClick={()=>toggle(!on)}>{on?'Turn off':'Turn on'}</button>}
    {on&&relay?.message&&<p role="status">{relay.message}</p>}
    {on&&relay?.state==='online'&&<>
     <p>On your other device, go to <code>{link.replace(/^https?:\/\//,'').replace(/\/$/,'')}</code> and sign in with the same account.</p>
     <button type="button" onClick={()=>navigator.clipboard?.writeText(link).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1800)}).catch(()=>{})}><i className="fa-regular fa-copy"/> {copied?'Copied':'Copy link'}</button>
     <p>Works while this computer is awake and Humperdinck is open.</p>
    </>}
   </div>
   <details className="server-mode">
    <summary>Advanced: local server</summary>
    <p>The desktop app talks to a private server on this computer at <code>{health?.url||window.location.origin}</code>. Choose Auto for a free port on every launch, or a fixed port.</p>
    <div className="server-local-address"><input type="number" min="0" max="65535" step="1" value={port} onChange={e=>setPort(e.target.value)} aria-label="Preferred local server port"/><button type="button" onClick={()=>setPort('0')}>Auto</button><button type="button" onClick={savePort}>Save port</button></div>
    {saved&&<p role="status">{saved}</p>}
   </details>
   {error&&<p role="alert">{error}</p>}
  </div>
 </div>;
}
