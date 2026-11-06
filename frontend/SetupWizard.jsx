import React,{useEffect,useMemo,useState} from 'react';
import {getModels,modelRequest,runModelSteps,presetInstallSteps} from './modelSetup.js';
import './SetupWizard.css';

const COMPLETION_KEY='humperdinck.setup.completed.v1';
export function setupCompleted(){try{return localStorage.getItem(COMPLETION_KEY)==='yes'}catch{return false}}
export default function SetupWizard({onClose}){
 const [data,setData]=useState(null),[failure,setFailure]=useState('');
 const [selected,setSelected]=useState({kokoro:true,piper:false,design:false,clone:false});
 const [design,setDesign]=useState(''),[clone,setClone]=useState('');
 const [progress,setProgress]=useState(null),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
 useEffect(()=>{getModels().then(d=>{setData(d);
   const q=d.engines.find(e=>e.id==='qwen-mlx'&&e.supported) || d.engines.find(e=>e.id==='qwen-torch'&&e.supported);
   const designChoice=q?.models.find(m=>m.roles.includes('design')&&!m.tight) || q?.models.find(m=>m.roles.includes('design'));
   const cloneChoice=q?.models.find(m=>m.roles.includes('clone')&&!m.tight) || q?.models.find(m=>m.roles.includes('clone'));
   if(designChoice)setDesign(q.id+'|'+designChoice.id);
   if(cloneChoice)setClone(q.id+'|'+cloneChoice.id);
 }).catch(e=>setFailure(e.message))},[]);
 const choices=useMemo(()=>data?.engines.filter(e=>e.supported&&(!data.native_package||e.native_installable))||[],[data]);
 const options=role=>choices.filter(e=>e.roles.includes(role)).flatMap(e=>e.models.filter(m=>m.roles.includes(role)).map(m=>({value:e.id+'|'+m.id,label:e.label+' · '+m.label+' · '+m.size_gb+' GB'+(m.tight?' · High memory use':''),engine:e.id,model:m.id})));
 const markDone=()=>{try{localStorage.setItem(COMPLETION_KEY,'yes')}catch{};onClose()};
 const start=async()=>{
   setBusy(true);setFailure('');setDone(false);
   try{
     const steps=[];
     const e=id=>choices.find(x=>x.id===id);
     if(selected.kokoro&&e('kokoro'))steps.push(...presetInstallSteps(e('kokoro'),[]));
     if(selected.piper&&e('piper'))steps.push(...presetInstallSteps(e('piper'),e('piper').models));
     for(const [role,value] of [['design',design],['clone',clone]]){
       if(!selected[role]||!value)continue;
       const [engine,model]=value.split('|');
       if(!steps.some(s=>s.engine===engine&&s.model===model))steps.push({engine,model});
     }
     if(!steps.length)throw Error('Choose at least one capability, or select Skip setup.');
     await runModelSteps(steps,setProgress);
     for(const [role,value] of [['design',design],['clone',clone]]){
       if(!selected[role]||!value)continue;
       const [engine,model]=value.split('|');
       await modelRequest('/api/models/selection',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({role,engine,model})});
     }
     setProgress(null);setDone(true);
   }catch(error){setFailure(error.message)}finally{setBusy(false)}
 };
 const toggle=(key)=><input type="checkbox" checked={!!selected[key]} disabled={busy} onChange={ev=>setSelected(s=>({...s,[key]:ev.target.checked}))}/>;
 return <div className="setup-overlay"><div className="setup-dialog" role="dialog" aria-modal="true" aria-label="First-time setup">
   <div className="setup-header"><div><small>GETTING STARTED</small><h2>Welcome to Humperdinck</h2><p>Choose what you want to do. We'll install the engines and models here, so you can get started without opening the Models tab.</p></div><button type="button" disabled={busy} aria-label="Skip setup" onClick={markDone}><i className="fa-solid fa-xmark"/></button></div>
   {data&&<p className="setup-hardware">{data.platform}{data.memory_gb?' · '+data.memory_gb+' GB RAM':''} · {choices.some(e=>e.id==='qwen-mlx')?'Apple MLX available':'CPU / PyTorch models available'}</p>}
   <p className="setup-advice"><i className="fa-solid fa-circle-info"/> You need only one model per activity. Start with our recommendation, then try other models in the Models tab to compare speed and quality. PyTorch installs automatically when needed; MLX is recommended on compatible Apple Silicon Macs.</p>
   {!data&&!failure&&<p>Detecting your computer and available engines…</p>}
   {data&&<div className="setup-options">
     <label className="setup-option">{toggle('kokoro')}<span><strong>Kokoro — fast narration</strong><small>Recommended starter option. Installs the engine and shared voice pack; no individual voice downloads needed.</small></span></label>
     <label className="setup-option">{toggle('piper')}<span><strong>Piper — lightweight narration</strong><small>Adds a curated pack of offline voices. Voices use separate files internally, but install as one bundle.</small></span></label>
     <div className="setup-option">{toggle('design')}<div><strong>Qwen — design a voice</strong><small>Turn a written voice description into speech. Requires a larger download.</small>{selected.design&&<select disabled={busy} aria-label="Voice design model" value={design} onChange={e=>setDesign(e.target.value)}>{options('design').map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>}</div></div>
     <div className="setup-option">{toggle('clone')}<div><strong>Qwen — clone an approved voice</strong><small>Generate speech from a reference voice recording. Requires a compatible Base model.</small>{selected.clone&&<select disabled={busy} aria-label="Voice cloning model" value={clone} onChange={e=>setClone(e.target.value)}>{options('clone').map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>}</div></div>
   </div>}
   {progress&&<div role="status" className="setup-progress"><strong>Step {progress.index+1} of {progress.total}: {progress.step.engine}</strong><p>{progress.message}</p><progress /></div>}
   {failure&&<p className="setup-error" role="alert">{failure} {busy?'':'You can retry without downloading completed models again.'}</p>}
   {done&&<p className="setup-success" role="status">Setup finished. Your selected models are installed. Try generating a short narration to verify audio output.</p>}
   <div className="setup-actions"><button type="button" disabled={busy} onClick={markDone}>{done?'Finish':'Skip for now'}</button>{!done&&<button type="button" className="primary" disabled={busy||!data} onClick={start}>{busy?'Installing…':'Install selected'}</button>}{done&&<button type="button" className="primary" onClick={markDone}>Start using Humperdinck</button>}</div>
 </div></div>;
}
