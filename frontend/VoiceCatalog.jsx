import React,{useState} from 'react';
import {useNotifications} from './Notifications.jsx';

/** Humperdinck Voice Gallery: listen to optional voices and download the ones you want. */
export default function VoiceCatalog({api,onInstalled,canDownload=false}){
 const {notify}=useNotifications();
 const [open,setOpen]=useState(false),[voices,setVoices]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState('');
 async function load(){
  setError('');
  try{setVoices((await api('voice-catalog')).voices)}catch(e){setError(e.message)}
 }
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
 return <details className="starter-voice-pack voice-catalog" open={open} onToggle={e=>{const o=e.currentTarget.open;setOpen(o);if(o&&!voices)load()}}>
  <summary><span><i className="fa-solid fa-store"/> Browse the voice gallery</span>
   <span>{voices?voices.length+' voices ':''}<i className="fa-solid fa-chevron-down"/></span></summary>
  {open&&<div className="starter-voice-pack-content">
   <p>More voices made by Humperdinck. Listen, then download the ones you like. They work offline once downloaded.</p>
   {error&&<p className="starter-voice-error" role="alert">{error} <button type="button" className="link" onClick={load}>Try again</button></p>}
   {!voices&&!error&&<p className="hint"><i className="fa-solid fa-spinner fa-spin"/> Loading the gallery…</p>}
   {voices&&!voices.length&&<p className="hint">No gallery voices yet. Check back soon.</p>}
   <div className="starter-voice-pack-list">{voices?.map(v=><div className="starter-voice-pack-row" key={v.voice_id}>
    <div><strong>{v.name}</strong><small>{v.category||'Voice'}</small></div>
    <div className="starter-voice-pack-actions">
     <audio controls preload="none" src={v.sample_url} aria-label={'Sample of '+v.name}/>
     {v.installed?<span className="catalog-installed"><i className="fa-solid fa-circle-check"/> In your library</span>
      :<button type="button" className="primary" disabled={!!busy} onClick={()=>download(v)} title={canDownload?'Download this voice':'Pro required to download this voice'}>
       <i className={'fa-solid '+(busy===v.voice_id?'fa-spinner fa-spin':canDownload?'fa-download':'fa-lock')}/> {canDownload?'Download':'Pro download'}</button>}
    </div></div>)}</div>
  </div>}
 </details>;
}
