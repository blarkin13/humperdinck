import React,{useEffect,useState} from 'react';
import {useNotifications} from './Notifications.jsx';

const roles=[['preset','Fast preset narration','Fast, CPU-friendly built-in voices in multiple languages, ready to use throughout Humperdinck. These are preset voices, not clones of uploaded recordings.'],
 ['design','Voice design','Turns a written description or the sliders into preview voices in Voice Creator.'],
 ['clone','Custom voice cloning','Recreates an approved designed voice or uploaded recording in Narration Studio. This can be much slower than preset narration.'],
 ['convert','Character voices','Gives any of your voices an accent or a character performance while keeping it that voice. About 130 MB plus PyTorch; runs on CPU.']];

// Kokoro's voices share one download, so it gets a single row instead of one per voice.
function KokoroVoices({e,data,running,install,removeModel}){
 const first=e.models[0],downloaded=e.models.some(m=>m.downloaded);
 if(!first)return null;
 return <div className="engine-model-scroll"><div className="model-row">
  <div className="model-info"><span><strong>Kokoro voices</strong><small> · {e.models.length} built-in voices in several languages</small></span>
   <small className="model-meta">One shared ~0.35 GB download · ~{first.memory_gb} GB RAM</small></div>
  <div className="model-actions">{e.supported&&(downloaded
   ?<button type="button" className="model-icon-action model-icon-delete" disabled={running} aria-label="Delete Kokoro voices" title="Delete the Kokoro voice download" onClick={()=>removeModel(e.id,first.id,true,false)}><i className="fa-solid fa-trash-can" aria-hidden="true"/></button>
   :<button type="button" className="model-icon-action model-icon-download" disabled={running||!e.installed} aria-label="Download Kokoro voices" title={e.installed?'Download the Kokoro voices':'Install the voice engine above first'} onClick={()=>install(e.id,first.id,first.size_gb)}><i className="fa-solid fa-download" aria-hidden="true"/></button>)}</div>
 </div></div>;
}

// Choose which model handles each job, and install engines or download models that are missing.
export default function Models({onOpenSetup}){
 const {notify,confirm:askConfirm}=useNotifications();
 const [data,setData]=useState(null),[error,setError]=useState(''),[job,setJob]=useState(null),[msg,setMsg]=useState(''),[expanded,setExpanded]=useState({});
 async function load(){try{const r=await fetch('/api/models'),j=await r.json();if(!r.ok)throw Error(j.detail);setData(j);if(j.installing)setJob(j.installing)}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[]);
 useEffect(()=>{if(!job||!['queued','running'].includes(job.status))return;
  const t=setInterval(async()=>{try{const j=await (await fetch('/api/jobs/'+job.job_id)).json();setJob(j);if(!['queued','running'].includes(j.status))load()}catch{}},1500);return()=>clearInterval(t)},[job?.job_id,job?.status]);
 async function choose(role,engine,model){setMsg('');try{const r=await fetch('/api/models/selection',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({role,engine,model})}),j=await r.json();if(!r.ok)throw Error(j.detail);setData(d=>({...d,selected:j}));notify('Model selection saved. New jobs will use this model.','success')}catch(e){setMsg(e.message);notify(e.message,'error')}}
 async function install(engine,model,size){
  const what=model?`download ${model} (about ${size} GB)`:'install this engine (several minutes, a few GB of packages)';
  if(!await askConfirm(`This needs an internet connection and will ${what}. Continue?`,{title:'Install AI model',confirmLabel:'Install'}))return;
  try{const r=await fetch('/api/models/install',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engine,model})}),j=await r.json();if(!r.ok)throw Error(j.detail);setJob(j);notify('Model installation started.','info')}catch(e){setMsg(e.message);notify(e.message,'error')}}
 async function removeModel(engine,model,shared,selected){
  const impact=shared?'This removes the shared Kokoro model and disables ALL Kokoro voices.':'This removes only the downloaded weights for this model.';
  const inUse=selected?' It is currently selected for a job type; that job will not work until you download it again or choose another model.':'';
  if(!await askConfirm(`Delete downloaded files for ${model}?\n\n${impact}${inUse}\n\nYour saved voices and audio files will not be deleted.`,{title:'Delete downloaded model',confirmLabel:'Delete model',danger:true}))return;
  setMsg('');
  try{
   const r=await fetch('/api/models/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engine,model})});
   const j=await r.json();if(!r.ok)throw Error(j.detail||'Could not delete model');
   notify(j.message,'success');
   await load();
  }catch(e){setMsg(e.message)}
 }
 if(error)return <section><h2>Models</h2><div className="notice">{error}</div></section>;
 if(!data)return <section><h2>Models</h2><p>Loading...</p></section>;
 const latest=job?.job_id?job:data.recent_install;
 const running=['queued','running'].includes(latest?.status);
 return <section>
  <div className="heading"><div><h2>Models</h2><p>Pick the voices you like. <strong>You need just one model for each activity:</strong> reading text, designing a voice, or cloning an approved voice. Try another model later to compare quality, speed and memory use.</p></div><div className="model-heading-actions">{data.native_package&&<button type="button" onClick={onOpenSetup}><i className="fa-solid fa-list-check"/> Setup guide</button>}<span className="tag">{data.platform}{data.memory_gb?` · ${data.memory_gb} GB RAM`:''}</span></div></div>
  {latest&&<div className="job"><p>{latest.status==='complete'?'Completed: ':latest.status==='failed'?'Failed: ':''}{latest.message}</p>{running&&<progress/>}{latest.status==='complete'&&<p className="hint">Checkpoint files have been checked. Run a short voice preview to confirm the audio decoder can load.</p>}{latest.status==='failed'&&latest.log&&<pre className="log">{latest.log.join('\n')}</pre>}</div>}
  {msg&&<p className="hint">{msg}</p>}
  {data.native_package&&<div className="models-guide" aria-label="Getting started with voices">
   <div className="models-guide-title"><i className="fa-solid fa-headphones" aria-hidden="true"/><div><strong>Choose your voices</strong><p>Pick the voices you want to use. Humperdinck does the technical setup for you.</p></div></div>
   <div className="models-guide-items">
    <div className="models-guide-item"><i className="fa-solid fa-bolt" aria-hidden="true"/><div><strong>Ready to start</strong><span>Built-in Kokoro voices are included. Download their voice files once, then use them whenever you like.</span></div></div>
    <div className="models-guide-item"><i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true"/><div><strong>Create custom voices</strong><span>Qwen lets you design or copy a voice with permission. On a Mac, try the Apple Silicon option first. Other computers can use PyTorch.</span></div></div>
    <div className="models-guide-item"><i className="fa-solid fa-download" aria-hidden="true"/><div><strong>Download once, use offline</strong><span>You'll need an internet connection and some free storage for new voices. Your downloads stay on this computer.</span></div></div>
   </div>
   <div className={'models-guide-audio'+(data.ffmpeg_available?' ready':' warning')}><i className={'fa-solid '+(data.ffmpeg_available?'fa-circle-check':'fa-circle-info')} aria-hidden="true"/><span>{data.ffmpeg_available?'Audio export is ready.':'WAV audio works now. MP3 and video exports need FFmpeg installed first.'}</span></div>
  </div>}
  {roles.map(([role,title,blurb])=><div className="panel" key={role}><h3>{title}</h3><p>{blurb}</p>
   {data.engines.filter(e=>e.roles.includes(role)).map(e=><div className={'engine'+(e.supported?'':' unavailable')} key={e.id}>
    <div className="engine-head"><strong>{e.label}</strong><small>{e.supported?(e.installed?'Installed':'Not installed'):`Not available on ${data.platform}${e.requires_apple_silicon?' (needs an Apple Silicon Mac)':''}`} · {e.platforms.join(', ')}</small>
     {e.supported&&!e.installed&&(data.native_package&&!e.native_installable
      ?<span className="model-unavailable">Not supported by this installer</span>
      :<button disabled={running} onClick={()=>install(e.id)}>Install engine</button>)}</div>
    <small>{e.note}</small>
    {e.device&&<small className={'engine-device '+e.device.kind}><i className={'fa-solid '+(e.device.kind==='gpu'?'fa-bolt':'fa-microchip')} aria-hidden="true"/> Last ran on {e.device.kind==='gpu'?'GPU · '+e.device.name:'CPU'}{e.device.reason?' · '+e.device.reason:''}</small>}
    {e.id==='kokoro'?<KokoroVoices e={e} data={data} running={running} install={install} removeModel={removeModel}/>:<>
    <div className="engine-model-scroll" role="region" aria-label={e.label+' models'} tabIndex={0}>{e.models.filter(m=>m.roles.includes(role)).slice(0,expanded[e.id]?undefined:4).map(m=>{const sel=role!=='preset'&&data.selected[role]?.engine===e.id&&data.selected[role]?.model===m.id,usable=e.supported&&e.installed&&m.downloaded;
     return <div className={'model-row'+(sel?' chosen':'')} key={m.id}>
      <div className="model-info">
       <label className="check">{role!=='preset'&&<input type="radio" name={role} checked={sel} disabled={!usable} onChange={()=>choose(role,e.id,m.id)}/>} <span><strong>{m.label}</strong>{m.note&&<small> · {m.note}</small>}<br/><small className="mono">{m.id}</small></span></label>
       <small className="model-meta">{m.size_gb+' GB download'} · ~{m.memory_gb} GB RAM{m.gpu_memory_gb?` (or ${m.gpu_memory_gb} GB on an NVIDIA GPU)`:''}{m.tight&&<b className="warn"> · may be too large for this computer</b>}</small>
      </div>
      <div className="model-actions">
       {e.supported&&(data.native_package&&!e.native_installable
        ?<span className="model-unavailable">Not supported in this installer</span>
        :m.downloaded
         ?<button type="button" className="model-icon-action model-icon-delete" disabled={running} aria-label={'Delete downloaded model: '+m.label} title={e.id==='kokoro'?'Delete this shared voice download (all Kokoro voices will need it again)':'Delete downloaded model files'} onClick={()=>removeModel(e.id,m.id,e.id==='kokoro',sel)}><i className="fa-solid fa-trash-can" aria-hidden="true"/></button>
         :<button type="button" className="model-icon-action model-icon-download" disabled={running||!e.installed} aria-label={'Download model: '+m.label} title={!e.installed?'Install the voice engine above first':'Download this voice model'} onClick={()=>install(e.id,m.id,m.size_gb)}><i className="fa-solid fa-download" aria-hidden="true"/></button>)}
      </div>
     </div>})}</div>
    {e.models.filter(m=>m.roles.includes(role)).length>4&&<button className="model-list-expand" type="button" onClick={()=>setExpanded(old=>({...old,[e.id]:!old[e.id]}))} aria-expanded={!!expanded[e.id]}><i className={'fa-solid '+(expanded[e.id]?'fa-chevron-up':'fa-chevron-down')}/> {expanded[e.id]?'Show fewer models':`Show all ${e.models.filter(m=>m.roles.includes(role)).length} models`}</button>}</>}
   </div>)}
  </div>)}
  <p className="hint"><i className="fa-solid fa-lightbulb"/> Start with one small model for each activity. Listen to a short preview before downloading another. A larger model is not always the best option: it may run slower or exhaust your computer's memory. Downloads usually only need internet once.</p>
 </section>;
}
