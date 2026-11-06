import React,{useEffect,useState} from 'react';
import {useNotifications} from './Notifications.jsx';
import {getModels,modelRequest,runModelSteps,presetInstallSteps} from './modelSetup.js';

const roles=[['preset','Fast narration','Preset voices for quick, offline narration.'],
 ['design','Voice design','Create voices from written descriptions.'],
 ['clone','Voice cloning','Recreate an approved voice using a reference recording.']];
export default function Models(){
 const {notify,confirm:askConfirm}=useNotifications();
 const [data,setData]=useState(null),[error,setError]=useState(''),[progress,setProgress]=useState(null),[busy,setBusy]=useState(false),[filter,setFilter]=useState('all');
 async function load(){try{setData(await getModels());setError('')}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[]);
 async function installSteps(steps,label){
   if(!await askConfirm('Download and install '+label+'? Internet and free disk space are required.',{title:'Install models',confirmLabel:'Install'}))return;
   setBusy(true);setError('');setProgress(null);
   try{await runModelSteps(steps,setProgress);notify(label+' installed. Generate a preview to verify sound output.','success');await load()}
   catch(e){setError(e.message);notify(e.message,'error')}finally{setBusy(false)}
 }
 async function choose(role,engine,model){
   try{const d=await modelRequest('/api/models/selection',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({role,engine,model})});setData(v=>({...v,selected:d}));notify('Model selection saved','success')}
   catch(e){setError(e.message)}
 }
 async function remove(engine,model){
   if(!await askConfirm('Delete local weights for '+model+'? Saved voices and generated audio are kept.',{title:'Delete model',confirmLabel:'Delete',danger:true}))return;
   try{await modelRequest('/api/models/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engine,model})});await load();notify('Model files deleted','success')}
   catch(e){setError(e.message)}
 }
 if(!data)return <section><h2>Models</h2><p>{error||'Loading models…'}</p></section>;
 const visible=data.engines.filter(e=>filter==='all'||(filter==='mlx'&&e.id==='qwen-mlx')||(filter==='torch'&&e.id==='qwen-torch')||(filter==='cpu'&&['kokoro','piper'].includes(e.id)));
 const selectable=e=>e.supported&&(!data.native_package||e.native_installable);
 const rendering=e=>e.id==='kokoro'||e.id==='piper';
 return <section>
   <div className="heading"><div><h2>Models &amp; Engines</h2><p>Manage the AI engines installed on this computer.</p></div><span className="tag">{data.platform}{data.memory_gb?' · '+data.memory_gb+' GB RAM':''}</span></div>
   <div className="panel"><h3>Start with one model per activity</h3><p>One model is enough for narration, one for voice design and one for cloning. You do not need every model. Smaller models usually use less RAM and run faster; larger models may provide better quality, but should be compared on your computer.</p>
   <p><strong>Apple Silicon:</strong> Try Qwen MLX first for advanced voices. <strong>Windows / Linux:</strong> Qwen PyTorch offers CPU or compatible NVIDIA GPU processing. Kokoro and Piper are lightweight preset voice engines and do not require Qwen or PyTorch.</p></div>
   <div className="actions tight" role="group" aria-label="Filter speech engines">{[['all','All'],['mlx','Apple MLX'],['torch','PyTorch'],['cpu','CPU / ONNX']].map(([id,label])=><button type="button" key={id} className={filter===id?'active':''} onClick={()=>setFilter(id)}>{label}</button>)}</div>
   {progress&&<div className="job" role="status"><strong>Installing {progress.step.engine} · {progress.index+1} of {progress.total}</strong><p>{progress.message}</p>{busy&&<progress/>}</div>}
   {error&&<p className="notice" role="alert">{error}</p>}
   {visible.map(e=><div className="panel" key={e.id}>
     <div className="engine-head"><div><h3>{e.label}</h3><small>{e.supported?(e.installed?'Engine installed':'Engine not installed'):'Not supported by this computer'}</small></div>
       {selectable(e)&&<button disabled={busy||e.installed} onClick={()=>installSteps([{engine:e.id}],e.label+' engine')}>{e.installed?'Engine installed':'Install engine'}</button>}</div>
     <p>{e.note}</p>
     {rendering(e)?<div className="model-row">
       <div className="model-info"><strong>{e.id==='kokoro'?'Shared Kokoro model & voice pack':'Curated Piper voice bundle'}</strong><p className="hint">{e.id==='kokoro'?'One shared download supports all Kokoro presets.':'Install all included Piper voices together; individual files are managed automatically.'}</p></div>
       {selectable(e)&&<button disabled={busy} onClick={()=>installSteps(presetInstallSteps(e,e.models),e.label+' models')}>{e.models.every(m=>m.downloaded)?'Models installed':'Install models'}</button>}
     </div>:roles.filter(([role])=>e.roles.includes(role)).map(([role,title,desc])=><div key={role} className="model-group">
       <h4>{title}</h4><p className="hint">{desc}</p>
       {e.models.filter(m=>m.roles.includes(role)).map(m=>{
         const chosen=data.selected[role]?.engine===e.id&&data.selected[role]?.model===m.id;
         return <div className={'model-row'+(chosen?' chosen':'')} key={m.id}>
           <div className="model-info"><strong>{m.label}</strong> {chosen&&<small>· Selected</small>}
             <p className="hint">{m.note||''} {m.size_gb} GB download · approx. {m.memory_gb} GB RAM{m.tight?' · High memory use on this computer':''}</p>
             <small className="mono">{m.id}</small>
           </div>
           <div className="model-actions">
             {selectable(e)&&<>{m.downloaded&&e.installed?<button disabled={busy||chosen} onClick={()=>choose(role,e.id,m.id)}>{chosen?'In use':'Use'}</button>:<button disabled={busy} onClick={()=>installSteps([{engine:e.id,model:m.id}],m.label)}><i className="fa-solid fa-download"/> Install</button>}
             {m.downloaded&&<button className="model-icon-action model-icon-delete" aria-label={'Delete '+m.label} disabled={busy} onClick={()=>remove(e.id,m.id)}><i className="fa-solid fa-trash-can"/></button>}</>}
           </div>
         </div>
       })}
     </div>)}
     {!selectable(e)&&<p className="hint">{e.requires_apple_silicon?'Requires an Apple Silicon Mac.':'Not available with this installer.'}</p>}
   </div>)}
   <p className="hint">Installations use isolated runtimes and shared model storage. An installed model is not necessarily validated for synthesis; generate a short sample to test it.</p>
 </section>;
}
