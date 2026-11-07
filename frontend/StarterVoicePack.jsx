import React,{useEffect,useMemo,useState} from 'react';
import {useNotifications} from './Notifications.jsx';

const SENTENCE='The old lighthouse stood quietly above the waves, waiting for the next storm.';

/** Developer copy only: choose the Built-In Humperdinck Voices every install receives. */
export default function StarterVoicePack({api,voices,disabled=false}){
 const {notify}=useNotifications();
 const [open,setOpen]=useState(false),[approved,setApproved]=useState([]),[published,setPublished]=useState(null),
       [jobs,setJobs]=useState({}),[busy,setBusy]=useState(''),[changed,setChanged]=useState(false);
 const inPack=useMemo(()=>new Set(approved.map(v=>v.source_voice_id)),[approved]);
 const candidates=useMemo(()=>voices.filter(v=>v.origin!=='builtin-humperdinck'&&!inPack.has(v.voice_id)),[voices,inPack]);
 async function refresh(){
  if(disabled)return;
  try{const result=await api('starter-voices');setApproved(result.approved);setPublished(result.published)}
  catch(err){notify(err.message,'error')}
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
 async function run(id,work){
  setBusy(id);
  try{await work()}catch(err){notify(err.message,'error')}finally{setBusy('')}
 }
 const generate=voice=>run(voice.voice_id,async()=>{
  const job=await api('starter-voices/'+voice.voice_id+'/generate',{method:'POST'});
  setJobs(previous=>({...previous,[voice.voice_id]:job}));
 });
 const add=voice=>run(voice.voice_id,async()=>{
  await api('starter-voices/'+voice.voice_id+'/approve',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({job_id:jobs[voice.voice_id].job_id})});
  await refresh();setChanged(true);
  notify('Added '+voice.filename+'. Publish to send it to everyone.','success');
 });
 const remove=voice=>run(voice.source_voice_id,async()=>{
  if(!window.confirm('Remove "'+voice.name+'" from the built-in voices? After you publish, it disappears from every install.'))return;
  await api('starter-voices/'+voice.source_voice_id,{method:'DELETE'});
  await refresh();setChanged(true);
 });
 const setChannel=(voice,channel)=>run(voice.source_voice_id,async()=>{
  await api('starter-voices/'+voice.source_voice_id+'/channel',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel})});
  await refresh();setChanged(true);
 });
 const publish=()=>run('publish',async()=>{
  const result=await api('starter-voices/publish',{method:'POST'});
  setPublished(result);setChanged(false);
  notify('Published '+result.voices+' built-in and '+(result.gallery||0)+' gallery voices. Apps pick them up the next time they open (allow about 5 minutes).','success');
 });
 return <details className="starter-voice-pack" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary><span><i className="fa-solid fa-box-open"/> Built-In Humperdinck Voices</span>
   <span>{approved.length} in pack <i className="fa-solid fa-chevron-down"/></span></summary>
  {open&&<div className="starter-voice-pack-content">
   <p><strong>Built-in</strong> voices are sent to every Humperdinck install. <strong>Gallery</strong> voices appear in the voice gallery, in the app and on the website, for people to download if they want them. Changes reach people the next time they open the app, with no new release needed. Only the generated sample below is shared, never your original recording.</p>
   <blockquote>{SENTENCE}</blockquote>
   <h4>In the pack</h4>
   <div className="starter-voice-pack-list">{approved.map(voice=><div className="starter-voice-pack-row" key={voice.source_voice_id}>
    <div><strong>{voice.name}</strong><small>{voice.category||'Voice'}</small></div>
    <div className="starter-voice-pack-actions">
     <audio controls preload="none" src={'/api/starter-voices/'+voice.source_voice_id+'/sample.wav'} aria-label={'Sample for '+voice.name}/>
     <select aria-label={'Who gets '+voice.name} disabled={!!busy||disabled} value={voice.channel||'builtin'} onChange={e=>setChannel(voice,e.target.value)}>
      <option value="builtin">Built-in · everyone gets it</option><option value="catalog">Gallery · people choose it</option></select>
     <button type="button" disabled={!!busy||disabled} onClick={()=>remove(voice)}><i className="fa-solid fa-trash"/> Remove</button>
    </div></div>)}</div>
   {!approved.length&&<p className="hint">No voices in the pack yet.</p>}
   <h4>Add a voice</h4>
   <p className="hint">Generate the sample, listen, then add it. To change a voice that's already in the pack, remove it, edit it, and add it again.</p>
   <div className="starter-voice-pack-list">{candidates.map(voice=>{
    const job=jobs[voice.voice_id],ready=job?.status==='complete',working=job?.status==='running'||job?.status==='queued';
    return <div className="starter-voice-pack-row" key={voice.voice_id}>
     <div><strong>{voice.filename}</strong><small>{voice.category||'Uploaded & edited voice'}</small></div>
     <div className="starter-voice-pack-actions">
      <button type="button" disabled={!!busy||disabled||working} onClick={()=>generate(voice)}>
       <i className={'fa-solid '+(working?'fa-spinner fa-spin':'fa-wand-magic-sparkles')}/>{working?' Generating…':ready?' Generate again':' Generate sample'}</button>
      {ready&&<audio controls preload="none" src={'/api/outputs/'+job.job_id+'.wav'} aria-label={'Sample for '+voice.filename}/>}
      {job?.status==='failed'&&<small className="starter-voice-error">{job.message}</small>}
      {ready&&<button type="button" disabled={!!busy} onClick={()=>add(voice)}><i className="fa-solid fa-plus"/> Add to pack</button>}
     </div></div>;
   })}</div>
   {!candidates.length&&<p className="hint">Upload or record a voice first. It will appear here.</p>}
   <div className="starter-voice-pack-footer">
    <small>{changed?'You have changes that are not published yet.':published?'Last published '+published.published_at+' · '+published.voices+' built-in, '+(published.gallery||0)+' gallery':'Not published yet.'} Publishing uses your GitHub sign-in (gh).</small>
    <button type="button" className="primary" disabled={disabled||!!busy||!approved.length} onClick={publish}>
     <i className={'fa-solid '+(busy==='publish'?'fa-spinner fa-spin':'fa-cloud-arrow-up')}/> Publish {approved.length} {approved.length===1?'voice':'voices'}</button>
   </div>
  </div>}
 </details>;
}
