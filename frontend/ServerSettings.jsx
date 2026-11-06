import React,{useEffect,useState} from 'react';

export default function ServerSettings({onClose}){
 const [health,setHealth]=useState(null),[error,setError]=useState(''),[port,setPort]=useState('0'),[saved,setSaved]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{
  let alive=true;
  fetch('/api/server/settings',{cache:'no-store'}).then(async r=>{const j=await r.json();if(alive)setPort(String(j.preferred_port??0))}).catch(e=>{if(alive)setError(e.message)});
  fetch('/api/server/status',{cache:'no-store'}).then(async r=>{
   const data=await r.json();if(!r.ok)throw Error(data.detail||'Server check failed');
   if(alive)setHealth(data);
  }).catch(e=>{if(alive)setError(e.message)});
  const close=e=>{if(e.key==='Escape')onClose()};
  document.addEventListener('keydown',close);
  return()=>{alive=false;document.removeEventListener('keydown',close)};
 },[]);
 const address=health?.url||window.location.origin;
 async function savePort(){
  const value=Number(port);
  if(!Number.isInteger(value)||(value!==0&&(value<1024||value>65535))){setError('Use Auto (0) or a port between 1024 and 65535');return}
  setBusy(true);setError('');setSaved('');
  try{
   const r=await fetch('/api/server/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({port:value})});
   const j=await r.json();
   if(!r.ok)throw Error(j.detail||'Could not save server settings');
   setSaved(j.message);
  }catch(e){setError(e.message)}finally{setBusy(false)}
 }

 return <div className="server-settings-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="server-settings-modal" role="dialog" aria-modal="true" aria-label="Server settings">
   <header><h2><i className="fa-solid fa-server" aria-hidden="true"/> Server settings</h2><button type="button" onClick={onClose} aria-label="Close server settings"><i className="fa-solid fa-xmark"/></button></header>
   <p>Humperdinck runs a private local server on this computer. The desktop app and the Open in Browser option use the same voices, models and projects.</p>
   <div className="server-mode-options">
    <div className="server-mode"><strong><i className="fa-solid fa-circle-check"/> Local server — Active</strong><p>Bound to 127.0.0.1 only. This address is accessible from this computer, not your network or the internet.</p></div>
    <div className="server-mode unsupported"><strong><i className="fa-solid fa-network-wired"/> Network / remote server</strong><p>Not configured. Remote access requires authentication and TLS; it is not available in this preview.</p></div>
   </div>
   <div className="server-mode"><strong>Local port for next startup</strong><p>Choose Auto for a free port on every launch, or a fixed port for bookmarks and browser access. Only this computer can connect.</p><div className="server-local-address"><label><span className="sr-only">Preferred port</span><input type="number" min="0" max="65535" step="1" value={port} onChange={e=>setPort(e.target.value)} aria-label="Preferred local server port"/></label><button type="button" onClick={()=>setPort('0')}>Auto</button><button type="button" disabled={busy} onClick={savePort}>{busy?'Saving…':'Save port'}</button></div>{saved&&<p role="status">{saved}</p>}</div>
   <div><strong>Current local address</strong><div className="server-local-address"><code>{address}</code><button type="button" onClick={()=>navigator.clipboard?.writeText(address).catch(()=>{})}><i className="fa-regular fa-copy"/> Copy</button><button type="button" onClick={()=>window.open(address,'_blank','noopener,noreferrer')}>Open</button></div></div>
   <p>{error?('Server settings error: '+error):health?('Status: '+health.status+' · Current port: '+health.port):'Checking server status…'}</p>
  </div>
 </div>;
}
