import React,{useEffect,useState} from 'react';
import {useNotifications} from './Notifications.jsx';
import {useDialogFocus} from './useDialogFocus.js';
import {SleeveArt} from './VoiceGrid.jsx';
import {humperdinckVoiceLabel} from './voiceLabels.js';

/** Humperdinck Voice Gallery: a card that opens every voice not downloaded yet. */
export default function VoiceCatalog({api,onInstalled,canDownload=false}){
 const {notify}=useNotifications();
 const [open,setOpen]=useState(false),[voices,setVoices]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState('');
 async function load(){
  setError('');
  try{setVoices((await api('voice-catalog')).voices)}catch(e){setError(e.message)}
 }
 useEffect(()=>{load()},[]);
 const remaining=(voices||[]).filter(v=>!v.installed);
 async function download(voice){
  if(!canDownload){notify('Voice downloads require Pro. Checkout is not available yet.','info');return}
  setBusy(voice.voice_id);
  try{
   await api('voice-catalog/'+voice.voice_id+'/download',{method:'POST'});
   setVoices(old=>old.map(v=>v.voice_id===voice.voice_id?{...v,installed:true}:v));
   notify(voice.name+' is in your Voice Library.','success');
   onInstalled?.();
  }catch(e){notify(e.message,'error')}finally{setBusy('')}
 }
 return <>
  <article className="voice-card gallery-browse-card" role="button" tabIndex={0} aria-label="Browse the voice gallery"
   onClick={()=>setOpen(true)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setOpen(true)}}}>
   <span className="gallery-browse-icon"><i className="fa-solid fa-store" aria-hidden="true"/></span>
   <strong>Browse the gallery</strong>
   <small>{error?'Gallery unavailable · try again':!voices?'Loading…':remaining.length?`${remaining.length} more ${remaining.length===1?'voice':'voices'} to download`:'You have every gallery voice'}</small>
  </article>
  {open&&<GalleryDialog voices={remaining} error={error} busy={busy} canDownload={canDownload} onDownload={download} onRetry={load} onClose={()=>setOpen(false)}/>}
 </>;
}

function GalleryDialog({voices,error,busy,canDownload,onDownload,onRetry,onClose}){
 const dialogRef=useDialogFocus({onEscape:onClose});
 return <div className="narrator-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="narrator-modal gallery-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Voice gallery">
   <div className="narrator-modal-head"><div><h3><i className="fa-solid fa-store" aria-hidden="true"/> Voice gallery</h3><p>Listen, then download the voices you like. They work offline once downloaded.</p></div>
    <button type="button" className="narrator-close" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark" aria-hidden="true"/></button></div>
   <div className="gallery-modal-grid">
    {error&&<p className="starter-voice-error" role="alert">{error} <button type="button" className="link" onClick={onRetry}>Try again</button></p>}
    {!error&&!voices.length&&<p className="hint">You have every gallery voice. Check back for new ones.</p>}
    {voices.map(v=><div className="voice-card gallery-voice" key={v.voice_id}>
     <div className="card-top"><div className="sleeve"><SleeveArt seed={'u'+v.voice_id+v.name}/></div>
      <div className="card-title"><span className="voice-name">{v.name}</span><small>{humperdinckVoiceLabel(v)}</small></div>
      <button type="button" className="gallery-download" disabled={!!busy} onClick={()=>onDownload(v)}
       aria-label={(canDownload?'Download ':'Pro required to download ')+v.name} title={canDownload?'Download':'Pro required'}>
       <i className={'fa-solid '+(busy===v.voice_id?'fa-spinner fa-spin':canDownload?'fa-download':'fa-lock')} aria-hidden="true"/></button></div>
     <audio controls preload="none" src={v.sample_url} aria-label={'Sample of '+v.name}/>
    </div>)}
   </div>
  </div>
 </div>;
}
