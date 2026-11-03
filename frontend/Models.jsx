import React,{useEffect,useState} from 'react';

const roles=[['design','Voice design','Turns a written description or the sliders into preview voices in Voice Library.'],
 ['clone','Narration & cloning','Speaks your scripts in a saved voice: designed, uploaded or recorded.']];

// Choose which model handles each job, and install engines or download models that are missing.
export default function Models(){
 const [data,setData]=useState(null),[error,setError]=useState(''),[job,setJob]=useState(null),[msg,setMsg]=useState('');
 async function load(){try{const r=await fetch('/api/models'),j=await r.json();if(!r.ok)throw Error(j.detail);setData(j);if(j.installing)setJob(j.installing)}catch(e){setError(e.message)}}
 useEffect(()=>{load()},[]);
 useEffect(()=>{if(!job||!['queued','running'].includes(job.status))return;
  const t=setInterval(async()=>{try{const j=await (await fetch('/api/jobs/'+job.job_id)).json();setJob(j);if(!['queued','running'].includes(j.status))load()}catch{}},1500);return()=>clearInterval(t)},[job?.job_id,job?.status]);
 async function choose(role,engine,model){setMsg('');try{const r=await fetch('/api/models/selection',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({role,engine,model})}),j=await r.json();if(!r.ok)throw Error(j.detail);setData(d=>({...d,selected:j}));setMsg('Saved. New jobs will use this model.')}catch(e){setMsg(e.message)}}
 async function install(engine,model,size){
  const what=model?`download ${model} (about ${size} GB)`:'install this engine (several minutes, a few GB of packages)';
  if(!confirm(`This needs an internet connection and will ${what}. Continue?`))return;
  try{const r=await fetch('/api/models/install',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({engine,model})}),j=await r.json();if(!r.ok)throw Error(j.detail);setJob(j)}catch(e){setMsg(e.message)}}
 if(error)return <section><h2>Models</h2><div className="notice">{error}</div></section>;
 if(!data)return <section><h2>Models</h2><p>Loading...</p></section>;
 const running=['queued','running'].includes(job?.status);
 return <section>
  <div className="heading"><div><h2>Models</h2><p>Pick which AI model does each job. Everything runs on this computer.</p></div><span className="tag">{data.platform}{data.memory_gb?` · ${data.memory_gb} GB RAM`:''}</span></div>
  {job&&<div className="job"><p>{job.message}</p>{running&&<progress/>}{job.status==='failed'&&job.log&&<pre className="log">{job.log.join('\n')}</pre>}</div>}
  {msg&&<p className="hint">{msg}</p>}
  {roles.map(([role,title,blurb])=><div className="panel" key={role}><h3>{title}</h3><p>{blurb}</p>
   {data.engines.filter(e=>e.roles.includes(role)).map(e=><div className={'engine'+(e.supported?'':' unavailable')} key={e.id}>
    <div className="engine-head"><strong>{e.label}</strong><small>{e.supported?(e.installed?'Installed':'Not installed'):`Not available on ${data.platform}${e.requires_apple_silicon?' (needs an Apple Silicon Mac)':''}`} · {e.platforms.join(', ')}</small>
     {e.supported&&!e.installed&&<button disabled={running} onClick={()=>install(e.id)}>Install engine</button>}</div>
    <small>{e.note}</small>
    {e.models.filter(m=>m.roles.includes(role)).map(m=>{const sel=data.selected[role].engine===e.id&&data.selected[role].model===m.id,usable=e.supported&&e.installed&&m.downloaded;
     return <div className={'model-row'+(sel?' chosen':'')} key={m.id}>
      <label className="check"><input type="radio" name={role} checked={sel} disabled={!usable} onChange={()=>choose(role,e.id,m.id)}/> <span><strong>{m.label}</strong>{m.note&&<small> · {m.note}</small>}<br/><small className="mono">{m.id}</small></span></label>
      <small className="model-meta">{m.size_gb} GB download · ~{m.memory_gb} GB RAM{m.gpu_memory_gb?` (or ${m.gpu_memory_gb} GB on an NVIDIA GPU)`:''}{m.tight&&<b className="warn"> · may be too large for this computer</b>}</small>
      {e.supported&&(m.downloaded?<small className="ok">Downloaded{sel?' · In use':''}</small>:<button disabled={running||!e.installed} title={e.installed?'':'Install the engine first'} onClick={()=>install(e.id,m.id,m.size_gb)}>Download</button>)}
     </div>})}
   </div>)}
  </div>)}
  <p className="hint">Downloads and installs need internet once; after that every model works offline. Larger models usually sound better but need more memory and run slower.</p>
 </section>;
}
