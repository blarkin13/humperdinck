import React,{useEffect,useState} from 'react';
import {useNotifications} from './Notifications.jsx';

const stages=[
 {id:'kokoro',icon:'fa-bolt',title:'Kokoro · Quick-start voices',desc:'Fast, ready-made narration voices. A single shared download unlocks many voices. Recommended first.',optional:false},
 {id:'torch',icon:'fa-microchip',title:'PyTorch · AI engine',desc:'Optional engine for Qwen on Windows, Linux and Mac. On Apple Silicon, MLX is usually a better first choice.',optional:true},
 {id:'qwen',icon:'fa-wand-magic-sparkles',title:'Qwen · Design and clone voices',desc:'Use VoiceDesign to create a new voice from a description, or Base to speak in the style of an approved recording.',optional:true},
];
const busyJob=job=>['queued','running'].includes(job?.status);
async function request(path,options){
 const response=await fetch('/api/'+path,options);
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(result.detail||'The installation could not start.');
 return result;
}
function chooseModel(engine,role,ram){
 const options=engine?.models?.filter(m=>m.roles.includes(role))||[];
 if(role==='design'&&engine?.id==='qwen-mlx'&&ram<=8.5)return options.find(m=>m.id.endsWith('4bit'))||options[0];
 if(role==='clone'&&engine?.id==='qwen-torch')return options.find(m=>m.id.includes('0.6B'))||options[0];
 return options[0];
}
export default function FirstRunSetup({onClose,onComplete}){
 const {notify}=useNotifications();
 const [models,setModels]=useState(null),[job,setJob]=useState(null),[error,setError]=useState('');
 const [expanded,setExpanded]=useState('kokoro'),[choices,setChoices]=useState({}),[finishing,setFinishing]=useState(false);
 async function refresh(){
  try{const data=await request('models');setModels(data);if(busyJob(data.installing))setJob(data.installing);setError('')}
  catch(e){setError(e.message)}
 }
 useEffect(()=>{refresh()},[]);
 useEffect(()=>{
  if(!busyJob(job))return;
  const interval=setInterval(async()=>{
   try{
    const value=await request('jobs/'+job.job_id);
    setJob(value);
    if(!busyJob(value)){
     if(value.status==='complete'&&value.model&&value.engine!=='kokoro'){
      // Downloading a model in the wizard also chooses it for its task.
      // Otherwise the Models tab could still point to an absent default.
      const latest=await request('models');
      const entry=latest.engines.find(e=>e.id===value.engine)?.models.find(m=>m.id===value.model);
      const role=entry?.roles?.find(r=>['design','clone','preset'].includes(r));
      if(role)await request('models/selection',{
       method:'PUT',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({engine:value.engine,model:value.model,role})
      });
     }
     await refresh();
    }
   }
   catch(e){setError(e.message)}
  },1400);
  return()=>clearInterval(interval);
 },[job?.job_id,job?.status]);
 const engine=id=>models?.engines.find(e=>e.id===id);
 const kokoro=engine('kokoro'),torch=engine('qwen-torch'),mlx=engine('qwen-mlx');
 const mac=!!mlx?.supported;
 const qwenId=choices.qwenEngine||(mac?'qwen-mlx':'qwen-torch');
 const qwen=engine(qwenId);
 const installed=(e,role)=>!!e?.installed&&e.models.some(m=>m.downloaded&&m.roles.includes(role));
 const done={
  kokoro:installed(kokoro,'preset'),
  torch:!!torch?.installed,qwen:installed(qwen,'design')||installed(qwen,'clone')
 };
 const count=Object.values(done).filter(Boolean).length;
 const pick=(e,role)=>{
  if(!e)return null;
  const custom=choices[e.id+role],saved=models?.selected?.[role];
  return e.models.find(m=>m.id===custom)
    ||(saved?.engine===e.id&&e.models.find(m=>m.id===saved.model))
    ||chooseModel(e,role,models?.memory_gb);
 };
 async function start(engineId,modelId){
  if(busyJob(job))return;
  try{
   setError('');
   const value=await request('models/install',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engine:engineId,model:modelId||null})});
   setJob(value);
  }catch(e){setError(e.message);notify(e.message,'error')}
 }
 async function select(role,engineId,modelId){
  try{
   await request('models/selection',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({role,engine:engineId,model:modelId})});
   notify('Voice choice saved for '+role+'.','success');await refresh();
  }catch(e){setError(e.message)}
 }
 async function finish(){
  setFinishing(true);
  try{await request('setup',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({finished:true})});onComplete()}
  catch(e){setError(e.message)}finally{setFinishing(false)}
 }
 function action(e,model){
  if(!e?.supported)return <small>Not available on this computer.</small>;
  if(!e.installed){
   if(e.id==='kokoro'&&models?.native_package)return <button disabled={busyJob(job)} type="button" onClick={()=>start(e.id,'af_heart')}><i className="fa-solid fa-download"/> Download shared voices</button>;
   return <button disabled={busyJob(job)||!e.native_installable} type="button" onClick={()=>start(e.id)}><i className="fa-solid fa-gears"/> Install engine</button>;
  }
  if(!model)return <span className="setup-ready"><i className="fa-solid fa-circle-check"/> Engine installed</span>;
  if(model.downloaded)return <span className="setup-ready"><i className="fa-solid fa-circle-check"/> Downloaded</span>;
  return <button disabled={busyJob(job)} type="button" onClick={()=>start(e.id,model.id)}><i className="fa-solid fa-download"/> Download {model.size_gb} GB</button>;
 }
 function modelOption(e,role,label){
  if(!e?.supported)return null;
  const options=e.models.filter(m=>m.roles.includes(role)),value=pick(e,role);
  if(!value)return null;
  return <div className="setup-model-option">
   <label htmlFor={'setup-'+role}>{label}</label>
   <select id={'setup-'+role} value={value.id} onChange={event=>setChoices(old=>({...old,[e.id+role]:event.target.value}))}>
    {options.map(m=><option key={m.id} value={m.id}>{m.label} · {m.size_gb} GB{m.tight?' · uses more memory':''}</option>)}
   </select>
   <small>{value.note||'Start with a smaller model and compare others later.'}{value.tight?' This model may be demanding for your computer.':''}</small>
   <div className="setup-buttons">{action(e,value)}{value.downloaded&&e.installed&&<button className="setup-secondary" disabled={busyJob(job)} onClick={()=>select(role,e.id,value.id)}>Use for {label.toLowerCase()}</button>}</div>
  </div>;
 }
 function details(id){
  if(id==='kokoro')return <><p>Kokoro is the simplest place to start. You only download its voice files once, even if you try several preset voices.</p><div className="setup-buttons">{action(kokoro,kokoro?.models[0])}</div></>;
  if(id==='torch')return <><p>PyTorch runs Qwen on Windows, Mac and Linux, but may use considerable memory. On an Apple Silicon Mac, you can skip this and select MLX in the Qwen step.</p><div className="setup-buttons">{action(torch,null)}</div></>;
  return <><p><strong>One model per activity is enough.</strong> VoiceDesign creates voices. Base copies an approved voice recording. You may install either or both.</p>
   <label htmlFor="setup-engine">Choose how Qwen runs</label><select id="setup-engine" value={qwenId} onChange={e=>setChoices(old=>({...old,qwenEngine:e.target.value}))}>
    {mac&&<option value="qwen-mlx">MLX · recommended for Apple Silicon</option>}
    {torch?.supported&&<option value="qwen-torch">PyTorch · Windows, Linux and Mac</option>}
   </select>
   <div className="setup-buttons">{action(qwen,null)}</div>
   {qwen?.installed?<div className="setup-model-options">{modelOption(qwen,'design','Design voices')}{modelOption(qwen,'clone','Clone voices')}</div>
    :<small>Install the selected engine above first. Then choose and download the model for the activity you want.</small>}</>;
 }
 return <div className="setup-overlay">
  <div className="setup-modal" role="dialog" aria-modal="true" aria-labelledby="setup-heading">
   <header className="setup-header"><div><span className="setup-eyebrow"><i className="fa-solid fa-headphones"/> FIRST-TIME SETUP</span><h2 id="setup-heading">Welcome to Humperdinck</h2><p>Let's get your voices ready. You can add more later.</p></div><button aria-label="Close setup" type="button" disabled={busyJob(job)} onClick={onClose}><i className="fa-solid fa-xmark"/></button></header>
   <div className="setup-tip"><i className="fa-solid fa-lightbulb"/><div><strong>Don't install everything.</strong><p>One model is enough for each activity: reading, voice design and voice cloning. Start small, listen to the results, then try alternatives only if you want different quality, speed or sound. Downloads need internet and free disk space.</p></div></div>
   <div className="setup-count"><strong>{count} of 4 ready</strong><small>Only the first step is recommended; the rest are optional.</small><progress value={count} max="4"/></div>
   {error&&<div className="setup-error" role="alert">{error}</div>}
   {job&&<div className="setup-job" role="status"><i className={'fa-solid '+(busyJob(job)?'fa-spinner fa-spin':job.status==='failed'?'fa-circle-exclamation':'fa-circle-check')}/> {job.message}{busyJob(job)&&<progress/>}</div>}
   <div className="setup-list">
    {stages.map(s=><section className="setup-stage" key={s.id}>
     <button type="button" className="setup-stage-trigger" aria-expanded={expanded===s.id} onClick={()=>setExpanded(old=>old===s.id?'':s.id)}>
      <i className={'fa-solid '+(done[s.id]?'fa-circle-check':'fa-circle')} aria-hidden="true"/>
      <i className={'fa-solid '+s.icon} aria-hidden="true"/><span><strong>{s.title}</strong><small>{s.desc}</small></span>
      <em>{done[s.id]?'Ready':s.optional?'Optional':'Start here'}</em><i className={'fa-solid '+(expanded===s.id?'fa-chevron-up':'fa-chevron-down')}/>
     </button>
     {expanded===s.id&&<div className="setup-stage-body">{details(s.id)}</div>}
    </section>)}
   </div>
   <footer className="setup-footer"><small><i className="fa-solid fa-hard-drive"/> Your downloads stay on this computer. Reopen this guide anytime from Models.</small><div><button className="setup-secondary" disabled={busyJob(job)} onClick={onClose}>Remind me later</button><button className="primary" disabled={finishing||busyJob(job)} onClick={finish}>{finishing?'Saving…':'Finish setup'} <i className="fa-solid fa-arrow-right"/></button></div></footer>
  </div>
 </div>;
}
