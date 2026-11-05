import React,{useState,useEffect,useRef,useCallback} from 'react';
import {useNotifications} from './Notifications.jsx';

const wait=ms=>new Promise(r=>setTimeout(r,ms));

// Non-intrusive background checks; installing an update always requires user approval.
export default function Updates(){
 const {notify,confirm:askConfirm}=useNotifications();
 const [open,setOpen]=useState(false),[state,setState]=useState('idle'),[info,setInfo]=useState(null),[msg,setMsg]=useState('');
 const panelRef=useRef(null),checkingRef=useRef(false),stateRef=useRef('idle');
 const check=useCallback(async (showPanel=false)=>{
  if(showPanel)setOpen(true);
  if(checkingRef.current||stateRef.current==='installing'||!navigator.onLine)return;
  checkingRef.current=true;setState('checking');setMsg('');
  try{
   const response=await fetch('/api/updates/check',{cache:'no-store'});
   if(!response.ok)throw Error('Update service unavailable (HTTP '+response.status+')');
   const j=await response.json();
   setInfo(j);setState('checked');
  }catch(e){
   setMsg(e.message||'Could not check for updates');
   setState('error');
  }finally{checkingRef.current=false}
 },[]);
 useEffect(()=>{stateRef.current=state},[state]);
 useEffect(()=>{
  // Check on startup, every five minutes while this tab is visible and online,
  // and immediately after the network reconnects. Never install automatically.
  const tick=()=>{if(document.visibilityState==='visible'&&navigator.onLine)check(false)};
  tick();
  const id=setInterval(tick,5*60*1000);
  window.addEventListener('online',tick);
  document.addEventListener('visibilitychange',tick);
  return()=>{clearInterval(id);window.removeEventListener('online',tick);document.removeEventListener('visibilitychange',tick)};
 },[check]);
 useEffect(()=>{
  if(!open||state==='installing')return;
  const outside=e=>{if(panelRef.current&&!panelRef.current.contains(e.target))setOpen(false)};
  const escape=e=>{if(e.key==='Escape')setOpen(false)};
  document.addEventListener('pointerdown',outside);
  document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)};
 },[open,state]);
 async function install(){
  if(!await askConfirm('Install this update? Humperdinck will restart. Your voices, recordings and outputs are kept.',{title:'Install update',confirmLabel:'Install and restart'}))return;
  stateRef.current='installing';setState('installing');setMsg('Downloading and verifying...');
  try{const r=await fetch('/api/updates/install',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({commit_sha:info.commit_sha})}),j=await r.json();if(!r.ok)throw Error(j.detail);
   setMsg(j.message);notify(j.message,j.installing?'info':'success');if(!j.installing){setState('checked');return}
   // Wait for the server to go down and come back, then load the new interface.
   let down=false;for(let i=0;i<180;i++){await wait(1000);try{const h=await fetch('/api/health',{cache:'no-store'});if(h.ok&&down){location.reload();return}if(!h.ok)down=true}catch{down=true}}
   setMsg('Humperdinck has not come back yet. Check the terminal window, then reload this page.')}catch(e){setMsg('Update failed: '+e.message);setState('checked')}}
 const files=info?[...info.changed_files,...info.removed_files.map(f=>f+' (removed)')]:[];
 return <div className="updates-control" ref={panelRef}>
  <button type="button" className="update-btn" aria-label={info?.available?'Update available · view update':'Check for updates'} title={info?.available?'Update available':'Check for updates'} aria-expanded={open} onClick={()=>{if(open)setOpen(false);else if(info)setOpen(true);else check(true)}} disabled={state==='installing'}><i className={'fa-solid '+(state==='checking'?'fa-arrows-rotate fa-spin':'fa-rotate')} aria-hidden="true"/>{info?.available&&<span className="update-available-dot" aria-hidden="true"/>}</button>
  {open&&<div className="update-panel" role="dialog" aria-label="Updates">
   <div className="editor-head"><strong>Updates</strong><div className="update-actions"><button type="button" className="update-check-icon" onClick={()=>check(false)} disabled={state==='checking'||state==='installing'} aria-label="Check now" title="Check now"><i className="fa-solid fa-rotate"/></button><button type="button" className="update-check-icon" onClick={()=>setOpen(false)} disabled={state==='installing'} aria-label="Close updates" title="Close"><i className="fa-solid fa-xmark"/></button></div></div>
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
 </div>;
}
