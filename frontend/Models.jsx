import React,{useEffect,useState} from 'react';
import {useNotifications} from './Notifications.jsx';

const roles=[['preset','Fast preset narration','Fast, CPU-friendly built-in voices in multiple languages, ready to use throughout Humperdinck. These are preset voices, not clones of uploaded recordings.'],
 ['design','Voice design','Turns a written description or the sliders into preview voices in Voice Creator.'],
 ['clone','Custom voice cloning','Recreates an approved designed voice or uploaded recording in Narration Studio. This can be much slower than preset narration.']];

// Choose which model handles each job, and install engines or download models that are missing.
export default function Models(){
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
 const repaired=(engine,model)=>latest?.engine===engine&&latest?.model===model&&latest?.status==='complete';
 return <section>
  <div className="heading"><div><h2>Models</h2><p>Pick which AI model does each job. Everything runs on this computer.</p></div><span className="tag">{data.platform}{data.memory_gb?` · ${data.memory_gb} GB RAM`:''}</span></div>
  {latest&&<div className="job"><p>{latest.status==='complete'?'Completed: ':latest.status==='failed'?'Failed: ':''}{latest.message}</p>{running&&<progress/>}{latest.status==='complete'&&<p className="hint">Checkpoint files have been checked. Run a short voice preview to confirm the audio decoder can load.</p>}{latest.status==='failed'&&latest.log&&<pre className="log">{latest.log.join('\n')}</pre>}</div>}
  {msg&&<p className="hint">{msg}</p>}
  {data.native_package&&<p className="notice">Native desktop app: Kokoro is bundled. Qwen MLX on Apple Silicon and Piper can be installed into a separate, per-user Python 3.12 runtime using the Install engine button. Qwen PyTorch is not bundled. Models download to the shared cache. Installation requires an internet connection and significant free disk space. {data.ffmpeg_available?'FFmpeg is available.':'FFmpeg is missing: on macOS install it with Homebrew (brew install ffmpeg); WAV output remains available.'}</p>}
  {roles.map(([role,title,blurb])=><div className="panel" key={role}><h3>{title}</h3><p>{blurb}</p>
   {data.engines.filter(e=>e.roles.includes(role)).map(e=><div className={'engine'+(e.supported?'':' unavailable')} key={e.id}>
    <div className="engine-head"><strong>{e.label}</strong><small>{e.supported?(e.installed?'Installed':'Not installed'):`Not available on ${data.platform}${e.requires_apple_silicon?' (needs an Apple Silicon Mac)':''}`} · {e.platforms.join(', ')}</small>
     {e.supported&&!e.installed&&(data.native_package&&!e.native_installable
      ?<span className="model-unavailable">Not supported by this installer</span>
      :<button disabled={running} onClick={()=>install(e.id)}>Install engine</button>)}</div>
    <small>{e.note}</small>
    <div className="engine-model-scroll" role="region" aria-label={e.label+' models'} tabIndex={0}>{e.models.filter(m=>m.roles.includes(role)).slice(0,expanded[e.id]?undefined:4).map(m=>{const sel=role!=='preset'&&data.selected[role].engine===e.id&&data.selected[role].model===m.id,usable=e.supported&&e.installed&&m.downloaded;
     return <div className={'model-row'+(sel?' chosen':'')} key={m.id}>
      <div className="model-info">
       <label className="check">{role!=='preset'&&<input type="radio" name={role} checked={sel} disabled={!usable} onChange={()=>choose(role,e.id,m.id)}/>} <span><strong>{m.label}</strong>{m.note&&<small> · {m.note}</small>}<br/><small className="mono">{m.id}</small></span></label>
       <small className="model-meta">{e.id==='kokoro'?'Shared ~0.35 GB voice bundle':e.id==='piper'?'Separate voice download':m.size_gb+' GB download'} · ~{m.memory_gb} GB RAM{m.gpu_memory_gb?` (or ${m.gpu_memory_gb} GB on an NVIDIA GPU)`:''}{m.tight&&<b className="warn"> · may be too large for this computer</b>}</small>
      </div>
      <div className="model-actions">
       {m.downloaded&&<small className="model-status ok">{repaired(e.id,m.id)?'Files verified · repair complete':'Downloaded'}{sel?' · In use':''}</small>}
       {e.supported&&(data.native_package&&!e.native_installable
        ?<span className="model-unavailable">Not supported in this installer</span>
        :m.downloaded?<>{e.id==='qwen-mlx'&&<button disabled={running} title="Recheck model files, update MLX and download missing files" onClick={()=>install(e.id,m.id,m.size_gb)}>{repaired(e.id,m.id)?'Repair again':'Repair / update'}</button>}<button className="danger" disabled={running} title={e.id==='kokoro'?'Delete the shared Kokoro model and all Kokoro presets':'Delete only these downloaded model weights'} onClick={()=>removeModel(e.id,m.id,e.id==='kokoro',sel)}>Delete model</button></>
        :e.installed?<button disabled={running} onClick={()=>install(e.id,m.id,m.size_gb)}>Download</button>
        :<small className="model-status">Install the engine above first</small>)}
      </div>
     </div>})}</div>
    {e.models.filter(m=>m.roles.includes(role)).length>4&&<button className="model-list-expand" type="button" onClick={()=>setExpanded(old=>({...old,[e.id]:!old[e.id]}))} aria-expanded={!!expanded[e.id]}><i className={'fa-solid '+(expanded[e.id]?'fa-chevron-up':'fa-chevron-down')}/> {expanded[e.id]?'Show fewer models':`Show all ${e.models.filter(m=>m.roles.includes(role)).length} models`}</button>}
   </div>)}
  </div>)}
  <p className="hint">Downloads and installs need internet once; after that every model works offline. Larger models usually sound better but need more memory and run slower.</p>
 </section>;
}
