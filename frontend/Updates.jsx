import React,{useState,useEffect,useRef,useCallback} from 'react';
import {useNotifications} from './Notifications.jsx';
import {formatUpdateFiles} from './updateFiles.js';

const wait=ms=>new Promise(r=>setTimeout(r,ms));
const signedUpdater=()=>globalThis.__TAURI__?.core?.invoke;


// Non-intrusive background checks; installing an update always requires user approval.
export default function Updates(){
 const {notify,confirm:askConfirm}=useNotifications();
 const [open,setOpen]=useState(false),[state,setState]=useState('idle'),[info,setInfo]=useState(null),[msg,setMsg]=useState('');
 const panelRef=useRef(null),checkingRef=useRef(false),stateRef=useRef('idle');
 const check=useCallback(async (showPanel=false)=>{
  if(showPanel)setOpen(true);
  if(checkingRef.current||stateRef.current==='installing')return;
  checkingRef.current=true;stateRef.current='checking';setState('checking');setInfo(null);setMsg('');
  const controller=new AbortController();
  const deadline=setTimeout(()=>controller.abort(),20000);
  try{
   // Tauri's native updater verifies the signed artifact before installation.
   // The localhost/browser edition uses HTTP release discovery as fallback.
   const invoke=signedUpdater();
   if(invoke){
    const signed=await invoke('check_signed_update');
    if(signed?.configured){
     setInfo(signed.available?{
       available:true,latest:signed.version,version:signed.version,
       current_version:signed.current_version,summary:'Signed desktop application update',
       can_install:true,can_download:false,changed_files:[],removed_files:[],
       url:'https://humperdinck.larki-brian.workers.dev/#download'
     }:{available:false,reason:'Up to date with signed desktop releases',can_install:false});
     stateRef.current='checked';setState('checked');return;
    }
   }
   // navigator.onLine can incorrectly report offline. Always make the actual API request.
   const response=await fetch('/api/updates/check?t='+Date.now(),
    {cache:'no-store',signal:controller.signal,headers:{'Cache-Control':'no-cache'}});
   if(!response.ok){
    const detail=await response.json().catch(()=>null);
    throw Error(detail?.detail||'Update service unavailable (HTTP '+response.status+')');
   }
   const j=await response.json();
   setInfo(j);stateRef.current='checked';setState('checked');
  }catch(e){
   setInfo(null);
   // Tauri rejects with a plain string, not an Error.
   setMsg(e?.name==='AbortError'?'Update check timed out':(typeof e==='string'?e:e?.message)||'Could not check for updates');
   stateRef.current='error';setState('error');
  }finally{clearTimeout(deadline);checkingRef.current=false}
 },[]);
 useEffect(()=>{stateRef.current=state},[state]);
 useEffect(()=>{
  // Poll while the app is running, including Windows tabs that stay open
  // for hours. Refocus/visibility/network events check immediately too.
  // User confirmation is always required before installing an update.
  const tick=()=>check(false);
  const refocus=()=>{if(document.visibilityState==='visible')tick()};
  tick();
  const id=setInterval(tick,2*60*1000);
  window.addEventListener('online',tick);
  window.addEventListener('focus',refocus);
  document.addEventListener('visibilitychange',refocus);
  return()=>{clearInterval(id);window.removeEventListener('online',tick);window.removeEventListener('focus',refocus);document.removeEventListener('visibilitychange',refocus)};
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
  try{
   if(info?.version&&signedUpdater()){
    setMsg('Downloading and verifying signed desktop update…');
    await signedUpdater()('install_signed_update',{version:info.version});
    setMsg('Update installed. Restart Humperdinck to use the new version.');
    setState('checked');return;
   }
   const r=await fetch('/api/updates/install',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({commit_sha:info.commit_sha})}),j=await r.json();if(!r.ok)throw Error(j.detail);
   setMsg(j.message);notify(j.message,j.installing?'info':'success');if(!j.installing){setState('checked');return}
   // Wait for the server to go down and come back, then load the new interface.
   let down=false;for(let i=0;i<180;i++){await wait(1000);try{const h=await fetch('/api/health',{cache:'no-store'});if(h.ok&&down){location.reload();return}if(!h.ok)down=true}catch{down=true}}
   setMsg('Humperdinck has not come back yet. Check the terminal window, then reload this page.')}catch(e){setMsg('Update failed: '+(typeof e==='string'?e:e?.message));setState('checked')}}
 const files=formatUpdateFiles(info);
 return <div className="updates-control" ref={panelRef}>
  <button type="button" className="update-btn" aria-label={info?.available?'Update available · view update':'Check for updates'} title={info?.available?'Update available':'Check for updates'} aria-expanded={open} onClick={()=>{if(open)setOpen(false);else check(true)}} disabled={state==='installing'}><i className={'fa-solid '+(state==='checking'?'fa-arrows-rotate fa-spin':'fa-rotate')} aria-hidden="true"/>{info?.available&&<span className="update-available-dot" aria-hidden="true"/>}</button>
  {open&&<div className="update-panel" role="dialog" aria-label="Updates">
   <div className="editor-head"><strong>Updates</strong><div className="update-actions"><button type="button" className="update-check-icon" onClick={()=>check(false)} disabled={state==='checking'||state==='installing'} aria-label="Check now" title="Check now"><i className="fa-solid fa-rotate"/></button><button type="button" className="update-check-icon" onClick={()=>setOpen(false)} disabled={state==='installing'} aria-label="Close updates" title="Close"><i className="fa-solid fa-xmark"/></button></div></div>
   {state==='checking'&&<p role="status">Checking Humperdinck for updates…</p>}
   {state==='error'&&<p role="alert">{msg}</p>}
   {info&&!info.available&&<p>✓ {info.reason}.</p>}
   {info?.available&&<>
    <p><strong>{info.latest}</strong> {info.summary}<br/><small>{info.date&&new Date(info.date).toLocaleString()} · <a href={info.url} target="_blank" rel="noreferrer">View download page</a></small></p>
    {files.length>0&&<><small>{files.length} file{files.length===1?'':'s'} will change:</small><ul className="update-files">{files.map(f=><li key={f}>{f}</li>)}</ul></>}
    <p className="hint">Your local voices, recordings, outputs and model files remain outside the replaceable app.</p>
    {info.can_install?<button className="primary" onClick={install} disabled={state==='installing'}>{state==='installing'?'Installing...':'Install and restart'}</button>
    :info.can_download&&info.download_url?<><a className="primary native-installer-download" href={info.download_url} target="_blank" rel="noopener noreferrer">Download {info.download_name||'desktop installer'}</a><p className="hint">The installer downloads from the Humperdinck website. Quit Humperdinck to replace the application. Automatic installation requires a signed updater release.</p></>
    :<p className="hint">There is no binary update available for this installation.</p>}
   </>}
   {state==='installing'&&<p>{msg}</p>}
  </div>}
 </div>;
}
