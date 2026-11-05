import React,{useEffect,useMemo,useState} from 'react';
import {useNotifications} from './Notifications.jsx';

const SENTENCE='The old lighthouse stood quietly above the waves, waiting for the next storm.';

/** Explicitly approve generated reference samples before publishing any voice. */
export default function StarterVoicePack({api,voices,disabled=false}){
 const {notify}=useNotifications();
 const [open,setOpen]=useState(false),[approved,setApproved]=useState({}),
       [selected,setSelected]=useState([]),[jobs,setJobs]=useState({}),[busy,setBusy]=useState('');
 const candidates=useMemo(()=>voices.filter(v=>v.origin!=='builtin-humperdinck'),[voices]);
 async function refresh(){
  if(disabled)return;
  try{
   const result=await api('starter-voices');
   setApproved(Object.fromEntries(result.approved.map(v=>[v.source_voice_id,v])));
  }catch(err){notify(err.message,'error')}
 }
 useEffect(()=>{if(open)refresh()},[open,disabled]);
 useEffect(()=>{
  const active=Object.entries(jobs).filter(([,j])=>j.status==='running'||j.status==='queued');
  if(!active.length)return;
  const timer=setInterval(async()=>{
   const changes=await Promise.all(active.map(async([id,job])=>{
    try{return [id,await api('jobs/'+job.job_id)]}
    catch(err){return [id,{...job,status:'failed',message:err.message}]}
   }));
   setJobs(previous=>({...previous,...Object.fromEntries(changes)}));
  },1200);
  return()=>clearInterval(timer);
 },[jobs]);
 async function generate(voice){
  setBusy(voice.voice_id);
  try{
   const job=await api('starter-voices/'+voice.voice_id+'/generate',{method:'POST'});
   setJobs(previous=>({...previous,[voice.voice_id]:job}));
  }catch(err){notify(err.message,'error')}
  finally{setBusy('')}
 }
 async function approve(voice){
  const job=jobs[voice.voice_id];
  if(job?.status!=='complete')return;
  setBusy(voice.voice_id);
  try{
   await api('starter-voices/'+voice.voice_id+'/approve',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({job_id:job.job_id})});
   await refresh();
   setSelected(previous=>previous.includes(voice.voice_id)?previous:[...previous,voice.voice_id]);
   notify('Approved '+voice.filename+' for Built-In Humperdinck Voices','success');
  }catch(err){notify(err.message,'error')}
  finally{setBusy('')}
 }
 async function exportPack(){
  if(!selected.length)return;
  setBusy('export');
  try{
   const response=await fetch('/api/starter-voices/export',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({voice_ids:selected})});
   if(!response.ok){
    const result=await response.json().catch(()=>({}));
    throw Error(result.detail||'Could not export voices');
   }
   const objectUrl=URL.createObjectURL(await response.blob());
   const a=document.createElement('a');
   a.href=objectUrl;a.download='humperdinck-builtin-voices-v1.zip';
   document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(objectUrl),30000);
   notify('Exported '+selected.length+' approved voices without source recordings','success');
  }catch(err){notify(err.message,'error')}
  finally{setBusy('')}
 }
 return <details className="starter-voice-pack" open={open}
     onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary><span><i className="fa-solid fa-box-open"/> Built-In Humperdinck Voices</span>
   <span>{Object.keys(approved).length} approved <i className="fa-solid fa-chevron-down"/></span></summary>
  {open&&<div className="starter-voice-pack-content">
   <p>Prepare the voices included with new installations. Generate each voice speaking the standard sentence, listen, and approve it. The original uploaded audio is never exported.</p>
   <blockquote>{SENTENCE}</blockquote>
   <div className="starter-voice-pack-list">{candidates.map(voice=>{
    const job=jobs[voice.voice_id],ready=job?.status==='complete',saved=approved[voice.voice_id];
    return <div className="starter-voice-pack-row" key={voice.voice_id}>
     <div><strong>{voice.filename}</strong><small>{voice.category||'Uploaded & edited voice'}{saved?' · Approved':''}</small></div>
     <div className="starter-voice-pack-actions">
      <button type="button" disabled={!!busy||disabled} onClick={()=>generate(voice)}>
       <i className={'fa-solid '+(job?.status==='running'||job?.status==='queued'?'fa-spinner fa-spin':'fa-wand-magic-sparkles')}/>
       {job?.status==='running'||job?.status==='queued'?' Generating…':' Generate sample'}</button>
      {ready&&<audio controls preload="none" src={'/api/outputs/'+job.job_id+'.wav'} aria-label={'Sample for '+voice.filename}/>}
      {job?.status==='failed'&&<small className="starter-voice-error">{job.message}</small>}
      {ready&&<button type="button" disabled={!!busy} onClick={()=>approve(voice)}>Approve</button>}
      {saved&&<label><input type="checkbox" checked={selected.includes(voice.voice_id)}
        onChange={e=>setSelected(previous=>e.target.checked?
          [...previous,voice.voice_id]:previous.filter(id=>id!==voice.voice_id))}/> Include</label>}
     </div>
    </div>;
   })}</div>
   {!candidates.length&&<p className="hint">Upload and edit a voice first. It will appear here.</p>}
   <div className="starter-voice-pack-footer">
    <small>Only approved generated lighthouse samples, names, and metadata are exported. Your original recordings stay private.</small>
    <button type="button" className="primary" disabled={disabled||!!busy||!selected.length} onClick={exportPack}>
     <i className="fa-solid fa-file-zipper"/> Export {selected.length} Built-In Humperdinck {selected.length===1?'Voice':'Voices'}</button>
   </div>
  </div>}
 </details>;
}
