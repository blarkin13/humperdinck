import React,{useEffect,useRef,useState} from 'react';

const LIMIT=6;
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

// Voice cards grouped by category, each group collapsed to LIMIT cards with a "Show more" toggle.
// items: [{key,method,name,category,ready,status,summary,meters:[[label,0-100,low,high]],traits,specs:[[icon,text,title]],previewUrl,selected,onOpen,onDelete}]
export default function VoiceGrid({items,onCreate}){
 const [open,setOpen]=useState({}),[query,setQuery]=useState(''),[playing,setPlaying]=useState(null),audio=useRef(null);
 useEffect(()=>()=>audio.current?.pause(),[]);
 function play(e,v){e.stopPropagation();
  if(playing===v.key){audio.current?.pause();setPlaying(null);return}
  audio.current?.pause();const a=new Audio(v.previewUrl);a.onended=()=>setPlaying(null);a.play().catch(()=>setPlaying(null));audio.current=a;setPlaying(v.key)}
 const q=query.trim().toLowerCase();
 const shown=items.filter(v=>!q||[v.name,v.category,v.summary].some(t=>(t||'').toLowerCase().includes(q)));
 const groups={};shown.forEach(v=>(groups[v.category||'Uncategorized']=groups[v.category||'Uncategorized']||[]).push(v));
 const names=Object.keys(groups).sort((a,b)=>a==='Uncategorized'?1:b==='Uncategorized'?-1:a.localeCompare(b));
 return <div className="library">
  {items.length>LIMIT&&<div className="search-wrap"><i className="fa-solid fa-magnifying-glass"/><input className="search" placeholder="Search voices, categories or descriptions" value={query} onChange={e=>setQuery(e.target.value)}/></div>}
  {!items.length&&<div className="notice"><i className="fa-solid fa-record-vinyl"/> No voices yet. <button className="link" onClick={onCreate}>Create one in Voice Creator.</button></div>}
  {names.map(name=>{const list=groups[name],expanded=open[name]||!!q,visible=expanded?list:list.slice(0,LIMIT);
   return <div className="voice-group" key={name}>
    {names.length>1||name!=='Uncategorized'?<h4><i className="fa-solid fa-layer-group"/> {name} <small>{list.length} {list.length===1?'voice':'voices'}</small></h4>:null}
    <div className="voice-grid">{visible.map(v=>{const m=METHODS[v.method]||METHODS.designed,on=playing===v.key;
     return <article key={v.key} className={'voice-card'+(v.selected?' selected':'')+(v.ready?' ready':'')} role="button" tabIndex={0} aria-label={'Open '+v.name} onClick={v.onOpen} onKeyDown={e=>e.key==='Enter'&&v.onOpen()}>
     {v.onDelete&&<button className="card-x" title={'Delete '+v.name} aria-label={'Delete '+v.name} onClick={e=>{e.stopPropagation();v.onDelete()}}><i className="fa-solid fa-xmark"/></button>}
     <div className="card-top">
      <div className="sleeve"><SleeveArt seed={v.key+v.name}/>
       <button className={'play'+(on?' on':'')+(v.previewUrl?'':' none')} title={v.previewUrl?(on?'Stop':'Play preview'):v.method==='preset'?'Use this voice in Narration Studio':'No preview yet: open the voice to generate one'} aria-label={(on?'Stop ':'Play ')+v.name}
        onClick={e=>v.previewUrl?play(e,v):(e.stopPropagation(),v.onOpen())}><i className={'fa-solid '+(on?'fa-stop':v.previewUrl?'fa-play':v.method==='preset'?'fa-arrow-right':'fa-wand-magic-sparkles')}/></button>
       {on&&<span className="vu" aria-hidden="true"><i/><i/><i/><i/><i/></span>}
      </div>
      <div className="card-title">
       <strong className="voice-name">{v.name}</strong>
       <span className="method-tag"><i className={'fa-solid '+m[1]}/>{m[0]}</span>
       <span className="catalog-no">HMP-{String(hash(v.key)%1000).padStart(3,'0')}</span>
      </div>
     </div>
     <p className={'voice-desc'+(v.summary?'':' muted')}>{v.summary||'No description yet.'}</p>
     {v.meters?<div className="meters">{v.meters.map(([label,value,low,high])=><div key={label} title={`${label}: ${value} (${low} – ${high})`}><span>{label}</span><b><i style={{width:value+'%'}}/></b></div>)}</div>
      :!!v.traits?.length&&<div className="traits">{v.traits.map(t=><span key={t}>{t}</span>)}</div>}
     <div className="card-foot">
      <span className={'status'+(v.ready?' ok':'')}><i className={'fa-solid '+(v.ready?'fa-circle-check':'fa-pen-ruler')}/>{v.status}</span>
      <span className="specs">{v.specs.filter(Boolean).map(([icon,text,title])=><span key={title} title={title}><i className={icon}/>{text}</span>)}</span>
     </div>
    </article>})}</div>
    {list.length>LIMIT&&!q&&<button className="link" onClick={()=>setOpen(o=>({...o,[name]:!expanded}))}><i className={'fa-solid '+(expanded?'fa-chevron-up':'fa-chevron-down')}/> {expanded?'Show less':`Show ${list.length-LIMIT} more`}</button>}
   </div>})}
 </div>;
}
