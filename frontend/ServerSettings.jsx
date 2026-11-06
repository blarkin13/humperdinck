import React,{useEffect,useState} from 'react';

export default function ServerSettings({onClose}){
 const [health,setHealth]=useState(null),[error,setError]=useState('');
 useEffect(()=>{
  let alive=true;
  fetch('/api/server/status',{cache:'no-store'}).then(async r=>{
   const data=await r.json();if(!r.ok)throw Error(data.detail||'Server check failed');
   if(alive)setHealth(data);
  }).catch(e=>{if(alive)setError(e.message)});
  const close=e=>{if(e.key==='Escape')onClose()};
  document.addEventListener('keydown',close);
  return()=>{alive=false;document.removeEventListener('keydown',close)};
 },[onClose]);
 const address=health?.url||window.location.origin;
 return <div className="server-settings-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="server-settings-modal" role="dialog" aria-modal="true" aria-label="Server settings">
   <header><h2><i className="fa-solid fa-server" aria-hidden="true"/> Server settings</h2><button type="button" onClick={onClose} aria-label="Close server settings"><i className="fa-solid fa-xmark"/></button></header>
   <p>Humperdinck runs a private local server on this computer. The desktop app and the Open in Browser option use the same voices, models and projects.</p>
   <div className="server-mode-options">
    <div className="server-mode"><strong><i className="fa-solid fa-circle-check"/> Local server — Active</strong><p>Bound to 127.0.0.1 only. This address is accessible from this computer, not your network or the internet.</p></div>
    <div className="server-mode unsupported"><strong><i className="fa-solid fa-network-wired"/> Network / remote server</strong><p>Not configured. Remote access requires authentication and TLS; it is not available in this preview.</p></div>
   </div>
   <div><strong>Local address</strong><div className="server-local-address"><code>{address}</code><button type="button" onClick={()=>navigator.clipboard?.writeText(address).catch(()=>{})}><i className="fa-regular fa-copy"/> Copy</button><button type="button" onClick={()=>window.open(address,'_blank','noopener,noreferrer')}>Open</button></div></div>
   <p>{error?('Server status: '+error):health?('Status: '+health.status+' · Port: '+health.port):'Checking server status…'}</p>
  </div>
 </div>;
}
