import React,{useEffect,useRef,useState} from 'react';

const PALETTES=[['#193A3E','#C6A46A','#F0E5CF'],['#A3544C','#F0E5CF','#C6A46A'],['#C6A46A','#101B23','#193A3E'],['#24494d','#A3544C','#F0E5CF'],['#F0E5CF','#193A3E','#A3544C']];

function hash(text){let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0}

// Mid-century sleeve art: a few circles, bars and arcs placed from the voice's name, so each voice keeps its own cover.
function SleeveArt({seed}){
 const h=hash(seed),[bg,a,b]=PALETTES[h%PALETTES.length],r=n=>(h>>>n)%100,layout=h%3;
 return <svg className="sleeve-art" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <rect width="160" height="100" fill={bg}/>
  {layout===0&&<><circle cx={40+r(3)*.6} cy="55" r="34" fill={a}/><circle cx={95+r(5)*.3} cy="45" r="22" fill="none" stroke={b} strokeWidth="5"/><rect x="0" y="84" width="160" height="5" fill={b}/></>}
  {layout===1&&<>{[0,1,2,3,4].map(i=><rect key={i} x={18+i*26} y={20+((h>>>i*3)%40)} width="12" height={80} fill={i%2?a:b}/>)}<circle cx={130} cy={24} r="12" fill={a}/></>}
  {layout===2&&<><path d="M0 100 A80 80 0 0 1 160 100" fill={a}/><path d="M30 100 A50 50 0 0 1 130 100" fill={bg}/><circle cx={30+r(7)} cy="26" r="9" fill={b}/><rect x="120" y="14" width="26" height="4" fill={b}/><rect x="120" y="22" width="18" height="4" fill={b}/></>}
 </svg>;
}

const METHODS={preset:['Built-in voice','fa-compact-disc'],sliders:['Designed with sliders','fa-sliders'],prompt:['Described in words','fa-feather-pointed'],designed:['Designed with AI','fa-wand-magic-sparkles'],
 uploaded:['Uploaded recording','fa-file-audio'],recorded:['Recorded with mic','fa-microphone'],edited:['Edited recording','fa-scissors']};

export function ago(iso){if(!iso)return '';const d=(Date.now()-new Date(iso))/864e5;return d<1?'Today':d<2?'Yesterday':d<30?`${Math.floor(d)} days ago`:new Date(iso).toLocaleDateString()}

// Horizontal voice shelves: the main page retains exclusive vertical scrolling.
function VoiceShelf({name,count,children}){
 const track=useRef(null),[position,setPosition]=useState(0),[atEnd,setAtEnd]=useState(count<=2);
 function update(){
  const el=track.current;
  if(!el)return;
  const card=el.querySelector('.voice-card');
  const step=card?card.getBoundingClientRect().width+16:320;
  setPosition(Math.min(count-1,Math.round(el.scrollLeft/step)));
  setAtEnd(el.scrollLeft+el.clientWidth>=el.scrollWidth-3);
 }
 useEffect(()=>{update()},[count]);
 function move(direction){
  const el=track.current;
  if(!el)return;
  const card=el.querySelector('.voice-card');
  const step=card?card.getBoundingClientRect().width+16:320;
  el.scrollBy({left:direction*step*2,behavior:'smooth'});
 }
 return <div className="voice-shelf">
  <div className="voice-shelf-controls">
   <span className="voice-shelf-count">{String(position+1).padStart(2,'0')} <span>/</span> {String(count).padStart(2,'0')}</span>
   <div className="voice-shelf-nav">
    <button type="button" onClick={()=>move(-1)} disabled={position===0} aria-label={'Previous '+name+' voices'} title="Previous voices"><i className="fa-solid fa-chevron-left"/></button>
    <button type="button" onClick={()=>move(1)} disabled={atEnd} aria-label={'Next '+name+' voices'} title="Next voices"><i className="fa-solid fa-chevron-right"/></button>
   </div>
  </div>
  <div className="voice-shelf-window">
   <div className="voice-shelf-track" role="region" aria-label={name+' voices'} tabIndex={0} ref={track} onScroll={update}>
    <div className="voice-grid">{children}</div>
   </div>
  </div>
 </div>;
}

// Voice cards grouped by category in horizontally browsable shelves.
// items: [{key,method,name,category,ready,status,summary,meters:[[label,0-100,low,high]],traits,specs:[[icon,text,title]],previewUrl,selected,onOpen,onDelete}]
export default function VoiceGrid({items,onCreate,previewDisabled=false}){
 const [query,setQuery]=useState(''),[playing,setPlaying]=useState(null),[previewJobs,setPreviewJobs]=useState({}),audio=useRef(null);
 useEffect(()=>()=>audio.current?.pause(),[]);
 function playAudio(v,url,kind='generated'){
  audio.current?.pause();
  const a=new Audio(url);
  a.onended=()=>setPlaying(null);
  a.play().catch(()=>{setPlaying(null);setPreviewJobs(old=>({...old,[v.key]:{status:'failed',message:'Could not play preview audio.'}}))});
  audio.current=a;
  setPlaying(v.key+':'+kind);
 }
 async function play(e,v,generate=false){
  e.stopPropagation();
  if(previewDisabled)return;
  if(v.sampleUrl&&!generate){
   if(playing===v.key+':sample'){audio.current?.pause();setPlaying(null);return}
   playAudio(v,v.sampleUrl,'sample');
   return;
  }
  const uploaded=v.method==='uploaded'||v.method==='recorded'||v.method==='edited';
  // Audition the user's own reference audio immediately. A real cloned
  // same-script comparison is still available as a separate explicit action.
  if(uploaded&&!generate&&v.previewUrl){
   if(playing===v.key+':original'){audio.current?.pause();setPlaying(null);return}
   playAudio(v,v.previewUrl,'original');
   return;
  }
  if(playing===v.key+':generated'){audio.current?.pause();setPlaying(null);return}
  if(previewJobs[v.key]?.status==='queued'||previewJobs[v.key]?.status==='running')return;
  try{
   const r=await fetch('/api/voice-previews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({voice_key:v.voiceKey})});
   const job=await r.json();
   if(!r.ok)throw Error(job.detail||'Could not generate preview');
   if(job.status==='complete'){playAudio(v,job.download_url);return}
   setPreviewJobs(old=>({...old,[v.key]:job}));
   if(!job.job_id)throw Error('Preview job was not created');
   // Poll only after the user asks for a preview; synthesis can be slow on CPU.
   for(let i=0;i<1800;i++){
    await new Promise(resolve=>setTimeout(resolve,1000));
    const response=await fetch('/api/jobs/'+job.job_id);
    const current=await response.json();
    if(!response.ok)throw Error(current.detail||'Preview job lost');
    setPreviewJobs(old=>({...old,[v.key]:current}));
    if(current.status==='complete'){playAudio(v,current.download_url);return}
    if(current.status==='failed')throw Error(current.message||'Preview generation failed');
   }
   throw Error('Preview is taking too long. Try again later.');
  }catch(err){setPreviewJobs(old=>({...old,[v.key]:{status:'failed',message:err.message}}))}
 }
 const q=query.trim().toLowerCase();
 const shown=items.filter(v=>!q||[v.name,v.category,v.summary].some(t=>(t||'').toLowerCase().includes(q)));
 const groups={};shown.forEach(v=>(groups[v.category||'Uncategorized']=groups[v.category||'Uncategorized']||[]).push(v));
 const names=Object.keys(groups).sort((a,b)=>{
  const custom=name=>name==='My Voices'||name.startsWith('My Voices · ');
  if(custom(a)!==custom(b))return custom(a)?-1:1;
  if(a==='Uncategorized'||b==='Uncategorized')return a==='Uncategorized'?1:-1;
  return a.localeCompare(b);
 });
 return <div className="library">
  {items.length>6&&<div className="search-wrap"><i className="fa-solid fa-magnifying-glass"/><input className="search" placeholder="Search voices, categories or descriptions" value={query} onChange={e=>setQuery(e.target.value)}/></div>}
  {!items.length&&<div className="notice"><i className="fa-solid fa-record-vinyl"/> No voices yet. <button className="link" onClick={onCreate}>Create one in Voice Creator.</button></div>}
  {names.map(name=>{const list=groups[name];
   return <div className="voice-group" key={name}>
    {names.length>1||name!=='Uncategorized'?<h4><i className="fa-solid fa-layer-group"/> {name} <small>{list.length} {list.length===1?'voice':'voices'}</small></h4>:null}
    <VoiceShelf name={name} count={list.length}>{list.map(v=>{const m=METHODS[v.method]||METHODS.designed,on=playing?.startsWith(v.key+':'),preview=previewJobs[v.key],working=['queued','running'].includes(preview?.status);
     return <article key={v.key} className={'voice-card'+(v.selected?' selected':'')+(v.ready?' ready':'')} role="button" tabIndex={0} aria-label={'Open '+v.name} onClick={v.onOpen} onKeyDown={e=>e.key==='Enter'&&v.onOpen()}>
     {v.onDelete&&<button className="card-x" title={'Delete '+v.name} aria-label={'Delete '+v.name} onClick={e=>{e.stopPropagation();v.onDelete()}}><i className="fa-solid fa-xmark"/></button>}
     <div className="card-top">
      <div className="sleeve"><SleeveArt seed={v.key+v.name}/>
       <button className={'play'+(on?' on':'')} disabled={(previewDisabled&&!v.sampleUrl)||(working&&!v.sampleUrl&&!(v.previewUrl&&(v.method==='uploaded'||v.method==='recorded'||v.method==='edited')))} title={v.sampleUrl?'Play a real Kokoro voice sample':previewDisabled?'Voice audio requires the downloaded app':v.previewUrl&&(v.method==='uploaded'||v.method==='recorded'||v.method==='edited')?'Play original recording immediately':working?'Generating the common preview sentence':preview?.status==='failed'?preview.message:on?'Stop preview':'Play the standard comparison sentence'} aria-label={(on?'Stop ':'Play ')+v.name} onClick={e=>play(e,v)}><i className={'fa-solid '+(on?'fa-stop':working&&!v.sampleUrl&&!(v.previewUrl&&(v.method==='uploaded'||v.method==='recorded'||v.method==='edited'))?'fa-spinner fa-spin':'fa-play')}/></button>
       {on&&<span className="vu" aria-hidden="true"><i/><i/><i/><i/><i/></span>}
      </div>
      <div className="card-title">
       <strong className="voice-name">{v.name}</strong>
       <span className="method-tag"><i className={'fa-solid '+m[1]}/>{m[0]}</span>
       <span className="catalog-no">HMP-{String(hash(v.key)%1000).padStart(3,'0')}</span>
      </div>
     </div>
     <p className={'voice-desc'+(v.summary?'':' muted')}>{v.summary||'No description yet.'}</p>
     {(v.method==='uploaded'||v.method==='recorded'||v.method==='edited')&&<div className="voice-comparison">
      <span className="voice-comparison-caption">Play auditions your original recording instantly.</span>
      <button type="button" className="voice-comparison-button" disabled={previewDisabled||working}
       onClick={e=>play(e,v,true)} title="Use the cloning model to speak the same sentence as every built-in voice">
       <i className={'fa-solid '+(working?'fa-spinner fa-spin':'fa-wave-square')}/>
       {working?'Generating comparison…':preview?.status==='complete'?'Play generated comparison':'Generate same-script sample'}
      </button>
      {working&&<small role="status">Cloning on CPU may take several minutes. {preview?.message||''}</small>}
     </div>}
     {previewDisabled&&<small className="voice-disabled-label">{v.sampleUrl?<><i className="fa-solid fa-volume-high"/> Play the Kokoro audio sample. Custom text requires the app.</>:<><i className="fa-solid fa-lock"/> Voice playback requires the desktop app</>}</small>}
     {preview?.status==='failed'&&<small className="warn">{preview.message}</small>}
     {v.meters?<div className="meters">{v.meters.map(([label,value,low,high])=><div key={label} title={`${label}: ${value} (${low} – ${high})`}><span>{label}</span><b><i style={{width:value+'%'}}/></b></div>)}</div>
      :!!v.traits?.length&&<div className="traits">{v.traits.map(t=><span key={t}>{t}</span>)}</div>}
     <div className="card-foot">
      <span className={'status'+(v.ready?' ok':'')}><i className={'fa-solid '+(v.ready?'fa-circle-check':'fa-pen-ruler')}/>{v.status}</span>
      <span className="specs">{v.specs.filter(Boolean).map(([icon,text,title])=><span key={title} title={title}><i className={icon}/>{text}</span>)}</span>
     </div>
    </article>})}</VoiceShelf>
   </div>})}
 </div>;
}
