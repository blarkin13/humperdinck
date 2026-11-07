import React,{useEffect,useState} from 'react';
import {useNotifications} from './Notifications.jsx';

// Guided setup: look at the computer, recommend one model per job, then install
// everything with one click. Advanced users can change any recommendation.
const busyJob=job=>['queued','running'].includes(job?.status);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function request(path,options){
 const response=await fetch('/api/'+path,options);
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(result.detail||'Something went wrong. Try again.');
 return result;
}
const json=body=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

function describe(hw){
 const memory=hw.memory_gb?` · ${hw.memory_gb} GB memory`:'';
 if(hw.apple_silicon)return `Mac with Apple Silicon${memory}`;
 if(hw.nvidia)return `${hw.os} · NVIDIA ${hw.nvidia.name.replace(/^NVIDIA\s*/,'')} (${hw.nvidia.memory_gb} GB)${memory}`;
 return `${hw.os} · no NVIDIA graphics card found${memory}`;
}

// The model this computer should use for a job, by memory and graphics card.
function recommend(engine,role,hw){
 const options=engine?.models.filter(m=>m.roles.includes(role))||[];
 const find=part=>options.find(m=>m.id.includes(part));
 const ram=hw.memory_gb||8;
 if(engine?.id==='qwen-mlx'){
  if(role==='design')return (ram<=8.5?find('4bit'):ram<=16?find('8bit'):find('bf16'))||options[0];
  return (ram<=8.5?find('0.6B-Base-8bit'):ram<=16?find('1.7B-Base-8bit'):find('1.7B-Base-bf16'))||options[0];
 }
 if(role==='clone')return ((hw.nvidia?.memory_gb||0)>=6||(!hw.nvidia&&ram>=16)?find('1.7B'):find('0.6B'))||options[0];
 return options[0];
}

export default function FirstRunSetup({onClose,onComplete}){
 const {notify}=useNotifications();
 const [models,setModels]=useState(null),[hw,setHw]=useState(null),[error,setError]=useState('');
 const [skip,setSkip]=useState({}),[custom,setCustom]=useState({}),[advanced,setAdvanced]=useState(false);
 const [running,setRunning]=useState(''),[job,setJob]=useState(null),[finishing,setFinishing]=useState(false);
 async function refresh(){
  try{const [m,h]=await Promise.all([request('models'),request('setup/hardware')]);setModels(m);setHw(h);setError('')}
  catch(e){setError(e.message)}
 }
 useEffect(()=>{refresh()},[]);
 if(!models||!hw)return <div className="setup-overlay"><div className="setup-modal"><p className="setup-loading">{error||'Checking your computer…'}</p></div></div>;

 const engine=id=>models.engines.find(e=>e.id===id);
 const qwenId=custom.engine||(hw.apple_silicon&&engine('qwen-mlx')?.supported?'qwen-mlx':'qwen-torch');
 const qwen=engine(qwenId),kokoro=engine('kokoro');
 // A model already on this computer beats downloading the recommended one.
 const model=role=>{
  const options=qwen?.models.filter(m=>m.roles.includes(role))||[],selected=models.selected?.[role];
  return options.find(m=>m.id===custom[role])
   ||options.find(m=>m.downloaded&&selected?.engine===qwen.id&&selected.model===m.id)
   ||options.find(m=>m.downloaded)
   ||recommend(qwen,role,hw);
 };
 const slow=!hw.apple_silicon&&!hw.nvidia;
 const steps=[
  {id:'kokoro',icon:'fa-bolt',title:'Ready-made voices',plain:'54 natural voices for reading your scripts. Fast on any computer.',
   engine:kokoro,model:kokoro?.models[0],size:0.35,done:!!kokoro?.models.some(m=>m.downloaded)},
  {id:'design',icon:'fa-wand-magic-sparkles',title:'Voice designer',role:'design',
   plain:'Creates a brand-new voice from a description you write.'+(slow?' Slow on computers without an NVIDIA graphics card.':''),
   engine:qwen,model:model('design')},
  {id:'clone',icon:'fa-clone',title:'Voice cloner',role:'clone',
   plain:'Reads your scripts in voices you designed or recorded (with permission).'+(slow?' Slow without an NVIDIA graphics card.':''),
   engine:qwen,model:model('clone')},
  {id:'ffmpeg',icon:'fa-film',title:'Audio and video export',plain:'FFmpeg, a free tool Humperdinck needs for MP3 and video files.',done:hw.ffmpeg,size:0.2},
 ].map(s=>({...s,size:s.size??(s.model?.downloaded?0:s.model?.size_gb??0),done:s.done??(!!s.engine?.installed&&!!s.model?.downloaded)}));
 const todo=steps.filter(s=>!s.done&&!skip[s.id]);
 const ready=steps.filter(s=>s.done).length;
 const total=todo.reduce((sum,s)=>sum+s.size,0);

 async function waitFor(started){
  let current=started;setJob(current);
  while(busyJob(current)){await wait(1400);current=await request('jobs/'+current.job_id);setJob(current)}
  if(current.status!=='complete')throw Error(current.message||'Installation failed');
 }
 async function install(step){
  setRunning(step.id);
  if(step.id==='ffmpeg'){
   if(!hw.ffmpeg_installable)return; // shown as instructions instead
   await waitFor(await request('setup/ffmpeg',json({})));
   return;
  }
  // One request installs the engine and downloads its model.
  await waitFor(await request('models/install',json({engine:step.engine.id,model:step.model.id})));
  if(step.role)await request('models/selection',{method:'PUT',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({role:step.role,engine:step.engine.id,model:step.model.id})});
 }
 async function installAll(){
  setError('');
  try{
   for(const step of todo){await install(step);await refresh()}
   notify('Humperdinck is set up.','success');
  }catch(e){setError(e.message);notify(e.message,'error')}
  finally{setRunning('');setJob(null);await refresh()}
 }
 async function finish(){
  setFinishing(true);
  try{await request('setup',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({finished:true})});onComplete()}
  catch(e){setError(e.message)}finally{setFinishing(false)}
 }
 function ffmpegHelp(){
  if(hw.ffmpeg||hw.ffmpeg_installable)return null;
  return <p className="setup-manual">{hw.os==='macOS'
   ?<>We can't install this one for you: get Homebrew from <a href="https://brew.sh" target="_blank" rel="noreferrer">brew.sh</a>, run <code>brew install ffmpeg</code> in Terminal, then reopen Humperdinck.</>
   :hw.os==='Linux'?<>We can't install this one for you: run <code>sudo apt install ffmpeg</code> in a terminal, then reopen Humperdinck.</>
   :<>We can't install this one for you: download it from <a href="https://ffmpeg.org/download.html" target="_blank" rel="noreferrer">ffmpeg.org</a>, then reopen Humperdinck.</>}</p>;
 }
 const busy=!!running;
 const remaining=todo.filter(s=>s.id!=='ffmpeg'||hw.ffmpeg_installable);
 return <div className="setup-overlay">
  <div className="setup-modal" role="dialog" aria-modal="true" aria-labelledby="setup-heading">
   <header className="setup-header"><div><span className="setup-eyebrow"><i className="fa-solid fa-headphones"/> SETUP</span><h2 id="setup-heading">Let's get Humperdinck ready</h2>
    <p>We checked your computer and picked what works best on it. Click <strong>Set up everything</strong> and we'll do the rest.</p></div>
    <button aria-label="Close setup" type="button" disabled={busy} onClick={onClose}><i className="fa-solid fa-xmark"/></button></header>
   <div className="setup-body">
    <div className="setup-computer"><i className={'fa-solid '+(hw.apple_silicon||hw.nvidia?'fa-bolt':'fa-microchip')}/><div><strong>Your computer</strong><span>{describe(hw)}</span>
     {slow&&<small>Without an NVIDIA graphics card, designing and cloning voices works but can take minutes per sentence. Ready-made voices are fast.</small>}</div></div>
    <div className="setup-count"><strong>{ready} of {steps.length} ready</strong><progress value={ready} max={steps.length}/></div>
    {error&&<div className="setup-error" role="alert"><i className="fa-solid fa-circle-exclamation"/> {error} Click <strong>Set up everything</strong> to try again.</div>}
    <ol className="setup-steps">{steps.map(s=><li key={s.id} className={'setup-step'+(s.done?' done':'')+(running===s.id?' active':'')+(skip[s.id]&&!s.done?' skipped':'')}>
     <span className="setup-step-status">{s.done?<i className="fa-solid fa-circle-check"/>:running===s.id?<i className="fa-solid fa-spinner fa-spin"/>:<i className={'fa-solid '+s.icon}/>}</span>
     <div className="setup-step-text">
      <strong>{s.title}</strong><span>{s.plain}</span>
      {s.role&&s.model&&<small className="setup-step-model">{s.model.label}{s.done?'':s.model.downloaded?' · already downloaded':` · ${s.size} GB download`}</small>}
      {running===s.id&&job&&<small className="setup-step-progress">{job.message}</small>}
      {s.id==='ffmpeg'&&!s.done&&ffmpegHelp()}
      {advanced&&s.role&&!s.done&&<select aria-label={'Model for '+s.title} disabled={busy} value={s.model?.id} onChange={e=>setCustom(old=>({...old,[s.role]:e.target.value}))}>
       {qwen.models.filter(m=>m.roles.includes(s.role)).map(m=><option key={m.id} value={m.id}>{m.label} · {m.size_gb} GB{m.tight?' · may be too large for this computer':''}</option>)}</select>}
     </div>
     <span className="setup-step-action">{s.done?<em>Ready</em>:<label className="setup-skip"><input type="checkbox" disabled={busy} checked={!skip[s.id]} onChange={e=>setSkip(old=>({...old,[s.id]:!e.target.checked}))}/> Include</label>}</span>
    </li>)}</ol>
    <button type="button" className="link setup-advanced" disabled={busy} onClick={()=>setAdvanced(a=>!a)}><i className={'fa-solid '+(advanced?'fa-chevron-up':'fa-sliders')}/> {advanced?'Hide model choices':'Choose different models'}</button>
    {advanced&&hw.apple_silicon&&<label className="setup-engine">Run custom voices with <select disabled={busy} value={qwenId} onChange={e=>setCustom({engine:e.target.value})}>
     <option value="qwen-mlx">MLX · recommended for Apple Silicon</option><option value="qwen-torch">PyTorch · slower on Mac</option></select></label>}
   </div>
   <footer className="setup-footer"><small><i className="fa-solid fa-hard-drive"/> {remaining.length?`About ${total.toFixed(1)} GB to download. Needs internet once; then everything works offline.`:'Everything selected is installed.'}</small>
    <div>{remaining.length?<><button className="setup-secondary" disabled={busy} onClick={onClose}>Later</button>
     <button disabled={busy} onClick={installAll}>{busy?<><i className="fa-solid fa-spinner fa-spin"/> Setting up…</>:<>Set up everything <i className="fa-solid fa-arrow-right"/></>}</button></>
     :<button disabled={finishing} onClick={finish}>Start using Humperdinck <i className="fa-solid fa-arrow-right"/></button>}</div></footer>
  </div>
 </div>;
}
