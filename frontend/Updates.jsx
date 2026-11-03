import React,{useState} from 'react';

const wait=ms=>new Promise(r=>setTimeout(r,ms));

// "Check updates" button: shows what changed on GitHub and installs only after approval.
export default function Updates(){
 const [open,setOpen]=useState(false),[state,setState]=useState('idle'),[info,setInfo]=useState(null),[msg,setMsg]=useState('');
 async function check(){setOpen(true);setState('checking');setMsg('');setInfo(null);
  try{const r=await fetch('/api/updates/check'),j=await r.json();if(!r.ok)throw Error(j.detail);setInfo(j);setState('checked')}catch(e){setMsg(e.message||'Could not check for updates');setState('error')}}
 async function install(){
  if(!confirm('Install this update? Humperdinck will restart. Your voices, recordings and outputs are kept.'))return;
  setState('installing');setMsg('Downloading and verifying...');
  try{const r=await fetch('/api/updates/install',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({commit_sha:info.commit_sha})}),j=await r.json();if(!r.ok)throw Error(j.detail);
   setMsg(j.message);if(!j.installing){setState('checked');return}
   // Wait for the server to go down and come back, then load the new interface.
   let down=false;for(let i=0;i<180;i++){await wait(1000);try{const h=await fetch('/api/health',{cache:'no-store'});if(h.ok&&down){location.reload();return}if(!h.ok)down=true}catch{down=true}}
   setMsg('Humperdinck has not come back yet. Check the terminal window, then reload this page.')}catch(e){setMsg('Update failed: '+e.message);setState('checked')}}
 const files=info?[...info.changed_files,...info.removed_files.map(f=>f+' (removed)')]:[];
 return <>
  <button className="update-btn" onClick={check} disabled={state==='checking'||state==='installing'}>{state==='checking'?'Checking...':'Check updates'}</button>
  {open&&<div className="update-panel" role="dialog" aria-label="Updates">
   <div className="editor-head"><strong>Updates</strong><button className="link" onClick={()=>setOpen(false)} disabled={state==='installing'}>Close</button></div>
   {state==='error'&&<p>{msg}</p>}
   {info&&!info.available&&<p>✓ {info.reason}.</p>}
   {info?.available&&<>
    <p><strong>{info.latest}</strong> {info.summary}<br/><small>{info.date&&new Date(info.date).toLocaleString()} · <a href={info.url} target="_blank" rel="noreferrer">View on GitHub</a></small></p>
    <small>{files.length} file{files.length===1?'':'s'} will change:</small>
    <ul className="update-files">{files.map(f=><li key={f}>{f}</li>)}</ul>
    <p className="hint">Your voices, recordings, outputs and settings in data/ are never changed. Replaced files are backed up in .update/backups.</p>
    {info.can_install?<button className="primary" onClick={install} disabled={state==='installing'}>{state==='installing'?'Installing...':'Install and restart'}</button>:<p className="hint">Start Humperdinck with start.sh to install updates from here.</p>}
   </>}
   {state==='installing'&&<p>{msg}</p>}
  </div>}
 </>;
}
