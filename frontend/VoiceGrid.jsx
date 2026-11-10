import React,{useEffect,useRef,useState} from 'react';

import {createAvatar} from '@dicebear/core';
import * as lorelei from '@dicebear/lorelei';

// Lorelei avatars by DiceBear (CC0). Drawn on this computer from the voice's
// name, so each voice keeps its own face and nothing is downloaded.
function hash(text){let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0}
const avatars=new Map();
function avatarUri(seed){
 if(!avatars.has(seed))avatars.set(seed,createAvatar(lorelei,{seed}).toDataUri());
 return avatars.get(seed);
}
function SleeveArt({seed}){
 return <img className="sleeve-art" src={avatarUri(seed)} alt="" aria-hidden="true" draggable="false"/>;
}

const METHODS={preset:['Built-in voice','fa-compact-disc'],sliders:['Designed with sliders','fa-sliders'],prompt:['Described in words','fa-feather-pointed'],designed:['Designed with AI','fa-wand-magic-sparkles'],
 uploaded:['Uploaded recording','fa-file-audio'],recorded:['Recorded with mic','fa-microphone'],edited:['Edited recording','fa-scissors'],'builtin-humperdinck':['Built-In Humperdinck Voice','fa-certificate'],'humperdinck-catalog':['From the voice gallery','fa-store']};

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
export default function VoiceGrid({items,onCreate,previewDisabled=false,onPreviewVoice=null,gallery=null,characterCounts=null,onCharacters=null}){
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
  if(previewDisabled){
   // The public Studio never loads a third-party MP3. Open the voice in
   // Narration Studio instead, where a real generated test is available.
   if(onPreviewVoice&&v.method==='preset')onPreviewVoice(v);
   return;
  }
  const uploaded=['uploaded','recorded','edited','builtin-humperdinck','humperdinck-catalog'].includes(v.method);
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
  // User-owned voices first, then official Humperdinck voices, then model presets.
  const rank=name=>name==='My Voices'||name.startsWith('My Voices · ')?0
   :name==='Built-In Humperdinck Voices'?1:2;
  if(rank(a)!==rank(b))return rank(a)-rank(b);
  if(a==='Uncategorized'||b==='Uncategorized')return a==='Uncategorized'?1:-1;
  return a.localeCompare(b);
 });
 // The Voice Gallery sits right after the Built-In Humperdinck Voices (or My Voices).
 const galleryAfter=[...names].reverse().find(name=>name==='Built-In Humperdinck Voices'||name==='My Voices'||name.startsWith('My Voices · '));
 const galleryGroup=<div className="voice-group voice-gallery-group" key="gallery"><h4><i className="fa-solid fa-store"/> Humperdinck Voice Gallery</h4>{gallery}</div>;
 return <div className="library">
  {items.length>6&&<div className="search-wrap"><i className="fa-solid fa-magnifying-glass"/><input className="search" type="search" aria-label="Search voices" placeholder="Search voices, categories or descriptions" value={query} onChange={e=>setQuery(e.target.value)}/></div>}
  {!items.length&&<div className="notice"><i className="fa-solid fa-record-vinyl"/> No voices yet. <button className="link" onClick={onCreate}>Create one in Voice Creator.</button></div>}
  {names.map(name=>{const list=groups[name];
   return <React.Fragment key={name}><div className="voice-group">
    {names.length>1||name!=='Uncategorized'?<h4><i className="fa-solid fa-layer-group"/> {name} <small>{list.length} {list.length===1?'voice':'voices'}</small></h4>:null}
    <VoiceShelf name={name} count={list.length}>{list.map(v=>{const m=METHODS[v.method]||METHODS.designed,on=playing?.startsWith(v.key+':'),preview=previewJobs[v.key],working=['queued','running'].includes(preview?.status);
     return <article key={v.key} className={'voice-card'+(v.selected?' selected':'')+(v.ready?' ready':'')} role="button" tabIndex={0} aria-label={'Open '+v.name} onClick={v.onOpen} onKeyDown={e=>e.key==='Enter'&&v.onOpen()}>
     {v.onDelete&&<button className="card-x" title={'Delete '+v.name} aria-label={'Delete '+v.name} onClick={e=>{e.stopPropagation();v.onDelete()}}><i className="fa-solid fa-xmark"/></button>}
     <div className="card-top">
      <div className="sleeve"><SleeveArt seed={v.key+v.name}/></div>
      <div className="card-title">
       <strong className="voice-name">{v.name}</strong>
       <span className="method-tag"><i className={'fa-solid '+m[1]}/>{m[0]}</span>
       <span className="catalog-no">HMP-{String(hash(v.key)%1000).padStart(3,'0')}</span>
      </div>
     </div>
     <p className={'voice-desc'+(v.summary?'':' muted')}>{v.summary||'No description yet.'}</p>
     <div className="voice-playback-row">
      <button type="button" className={'voice-playback-button'+(on?' on':'')} disabled={(previewDisabled&&!onPreviewVoice)||(working&&!(v.previewUrl&&(['uploaded','recorded','edited','builtin-humperdinck','humperdinck-catalog'].includes(v.method))))}
       title={previewDisabled&&onPreviewVoice?'Open this voice in Narration Studio':previewDisabled?'Voice audio requires the downloaded app':v.previewUrl&&(v.method==='uploaded'||v.method==='recorded'||v.method==='edited')?'Play saved voice sample':working?'Generating the comparison sentence':preview?.status==='failed'?preview.message:on?'Stop playback':'Play the standard comparison sentence'}
       aria-label={(previewDisabled&&onPreviewVoice?'Use ':'Play ')+v.name}
       onClick={e=>play(e,v)}>
       <i className={'fa-solid '+(previewDisabled&&onPreviewVoice?'fa-arrow-right':on?'fa-stop':working&&!(v.previewUrl&&(v.method==='uploaded'||v.method==='recorded'||v.method==='edited'))?'fa-spinner fa-spin':'fa-play')}/>
       <span>{previewDisabled&&onPreviewVoice?'Use in Narration Studio':on?'Stop playback':working?'Generating…':(v.method==='uploaded'||v.method==='recorded'||v.method==='edited')?v.method==='builtin-humperdinck'?'Play voice sample':'Play original':'Play voice sample'}</span>
      </button>
      {on&&<span className="voice-playback-indicator" aria-label="Playing"><i/><i/><i/><i/><i/></span>}
      {onCharacters&&characterCounts&&v.voiceKey in characterCounts&&<button type="button" className="voice-characters-button" title="Characters: this voice with accents and ways of talking"
       aria-label={`${v.name} characters (${characterCounts[v.voiceKey]})`} onClick={e=>{e.stopPropagation();onCharacters(v.voiceKey)}} onKeyDown={e=>e.stopPropagation()}>
       <i className="fa-solid fa-masks-theater" aria-hidden="true"/><span>{characterCounts[v.voiceKey]||'Characters'}</span></button>}
     </div>
     {(['uploaded','recorded','edited'].includes(v.method))&&<div className="voice-comparison">
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
   </div>{gallery&&name===galleryAfter&&galleryGroup}</React.Fragment>})}
   {gallery&&!galleryAfter&&galleryGroup}
 </div>;
}
