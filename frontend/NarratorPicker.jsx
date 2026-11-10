import {useDialogFocus} from './useDialogFocus.js';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import CharacterVoice from './CharacterVoice.jsx';

// Voices are grouped by where they came from; favorites and voices already in
// this script sit on top because multi-speaker scripts reuse a few voices.
// Characters live under their original voice's row, not in a group of their own.
const GROUPS=[['builtin','Built-in voices'],['gallery','From the voice gallery'],['designed','Designed voices'],['uploaded','Uploaded & recorded']];
const ICONS={builtin:'fa-microphone-lines',gallery:'fa-store',designed:'fa-wand-magic-sparkles',uploaded:'fa-file-audio',character:'fa-masks-theater'};
const LOCAL_KEY='humperdinck-voice-picker';

function readLocal(){try{const d=JSON.parse(localStorage.getItem(LOCAL_KEY)||'{}');return{favorites:d.favorites||[],recent:d.recent||[]}}catch{return{favorites:[],recent:[]}}}
function writeLocal(d){try{localStorage.setItem(LOCAL_KEY,JSON.stringify(d))}catch{}}

export default function NarratorPicker({api,options,currentKey,sectionNumber,usedKeys=[],publicStudio=false,onSelect,onClose,onOpenGallery,onVoiceCreated,onOpenModels}){
 const [search,setSearch]=useState(''),[chips,setChips]=useState([]),[picker,setPicker]=useState({favorites:[],recent:[]});
 const [playing,setPlaying]=useState(null),[previewState,setPreviewState]=useState({}),[variantOf,setVariantOf]=useState(null),[expanded,setExpanded]=useState({});
 const audio=useRef(null),list=useRef(null),searchBox=useRef(null);

 useEffect(()=>{
  if(publicStudio){setPicker(readLocal());return}
  api('voice-picker').then(setPicker).catch(()=>{});
 },[]);
 useEffect(()=>()=>audio.current?.pause(),[]);

 const favorites=new Set(picker.favorites);
 const byKey=useMemo(()=>new Map(options.map(v=>[v.value,v])),[options]);
 const chipChoices=useMemo(()=>{
  const genders=[...new Set(options.map(v=>v.gender).filter(Boolean))].sort();
  const regions=[...new Set(options.map(v=>v.region).filter(Boolean))].sort();
  return [...genders.map(g=>({id:'g:'+g,label:g[0].toUpperCase()+g.slice(1),test:v=>v.gender===g})),
   ...regions.map(r=>({id:'r:'+r,label:r.replace(/ English$/,''),test:v=>v.region===r}))];
 },[options]);
 const q=search.trim().toLowerCase();
 const active=chipChoices.filter(c=>chips.includes(c.id));
 // Chips of the same kind widen the match (Female or Male); different kinds narrow it.
 const matches=v=>(!q||[v.label,v.accent,v.region,v.gender].some(t=>String(t||'').toLowerCase().includes(q)))
  &&['g:','r:'].every(p=>{const set=active.filter(c=>c.id.startsWith(p));return !set.length||set.some(c=>c.test(v))});
 const pick=keys=>keys.map(k=>byKey.get(k)).filter(v=>v&&matches(v));
 // Recent leaves out voices already shown in Favorites or In this narration.
 const shownTop=new Set([...picker.favorites,...usedKeys]);
 const top=[['favorites','Favorites','fa-heart',pick(picker.favorites)],['used','In this narration','fa-list-check',pick(usedKeys)],['recent','Recently used','fa-clock-rotate-left',pick(picker.recent).filter(v=>!shownTop.has(v.value))]].filter(g=>g[3].length);
 const groups=GROUPS.map(([id,title])=>[id,title,ICONS[id],options.filter(v=>v.kind===id&&matches(v))]).filter(g=>g[3].length);
 // A search that only matches a character's name still finds it.
 if(q){const found=options.filter(v=>v.kind==='character'&&matches(v));if(found.length)groups.push(['character','Characters',ICONS.character,found])}
 const charactersOf=v=>options.filter(c=>c.kind==='character'&&c.parent===v.value);
 const total=groups.reduce((n,g)=>n+g[3].length,0);

 async function toggleFavorite(v){
  const on=!favorites.has(v.value);
  const next={...picker,favorites:on?[v.value,...picker.favorites]:picker.favorites.filter(k=>k!==v.value)};
  setPicker(next);
  if(publicStudio){writeLocal(next);return}
  try{setPicker(await api('voice-picker/favorites',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({voice_key:v.value,favorite:on})}))}catch{}
 }
 function choose(v){
  if(v?.locked)return;
  const key=v?.value||'';
  if(key){
   const next={...picker,recent:[key,...picker.recent.filter(k=>k!==key)].slice(0,8)};
   if(publicStudio)writeLocal(next);
   else api('voice-picker/recent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({voice_key:key})}).catch(()=>{});
  }
  audio.current?.pause();
  onSelect(key);
 }
 function playUrl(key,url){
  audio.current?.pause();
  const a=new Audio(url);
  a.onended=()=>setPlaying(null);
  a.play().catch(()=>{setPlaying(null);setPreviewState(o=>({...o,[key]:{status:'failed',message:'Could not play this preview.'}}))});
  audio.current=a;setPlaying(key);
 }
 async function preview(v){
  if(playing===v.value){audio.current?.pause();setPlaying(null);return}
  if(['queued','running'].includes(previewState[v.value]?.status))return;
  // Uploads and designed voices already have audio; presets get a short generated sample.
  if(v.previewUrl){playUrl(v.value,v.previewUrl);return}
  try{
   let job=await api('voice-previews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({voice_key:v.value})});
   for(let i=0;job.status!=='complete'&&i<900;i++){
    if(job.status==='failed')throw Error(job.message||'Preview failed');
    setPreviewState(o=>({...o,[v.value]:job}));
    await new Promise(r=>setTimeout(r,1000));
    job=await api('jobs/'+job.job_id);
   }
   if(job.status!=='complete')throw Error('Preview is taking too long.');
   setPreviewState(o=>({...o,[v.value]:job}));
   playUrl(v.value,job.download_url);
  }catch(e){setPreviewState(o=>({...o,[v.value]:{status:'failed',message:e.message}}))}
 }

 // Arrow keys move between voices, Enter picks, Space plays the preview.
 function rows(){return [...(list.current?.querySelectorAll('.narrator-option')||[])]}
 function onListKey(e){
  const all=rows(),index=all.indexOf(document.activeElement);
  if(index<0)return;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();all[Math.max(0,Math.min(all.length-1,index+(e.key==='ArrowDown'?1:-1)))]?.focus();if(e.key==='ArrowUp'&&index===0)searchBox.current?.focus()}
  else if(e.key==='Enter'){e.preventDefault();choose(byKey.get(all[index].dataset.key))}
  else if(e.key===' '){e.preventDefault();const v=byKey.get(all[index].dataset.key);if(!publicStudio&&v)preview(v)}
  else if(e.key.toLowerCase()==='f'&&!e.metaKey&&!e.ctrlKey){const v=byKey.get(all[index].dataset.key);if(v)toggleFavorite(v)}
 }
 function onSearchKey(e){if(e.key==='ArrowDown'){e.preventDefault();rows()[0]?.focus()}else if(e.key==='Enter'){const first=rows()[0];if(first){e.preventDefault();choose(byKey.get(first.dataset.key))}}}
 function onModalKey(e){if(e.key==='Escape'&&!variantOf){e.stopPropagation();onClose()}}

 const selected=byKey.get(currentKey);
 const row=(v,group)=>{
  const state=previewState[v.value],loading=['queued','running'].includes(state?.status),fav=favorites.has(v.value);
  return <div role="option" tabIndex={0} aria-selected={currentKey===v.value} data-key={v.value} key={group+v.value}
   className={'narrator-option '+(currentKey===v.value?'selected':'')+(v.locked?' locked':'')} aria-disabled={!!v.locked} onClick={()=>choose(v)}>
   <span className="narrator-avatar"><i className={'fa-solid '+ICONS[v.kind]} aria-hidden="true"/></span>
   <span className="narrator-option-text"><strong>{v.label}</strong>
    <small>{state?.status==='failed'?state.message:loading?(state.message||'Generating preview…'):v.locked?'Pro required · '+v.accent:v.accent}</small></span>
   <span className="narrator-option-actions">
    {!publicStudio&&<button type="button" tabIndex={-1} className={'narrator-icon '+(playing===v.value?'on':'')} title={playing===v.value?'Stop preview':'Play preview (Space)'} aria-label={(playing===v.value?'Stop preview of ':'Play preview of ')+v.label} onClick={e=>{e.stopPropagation();preview(v)}}>
     <i className={'fa-solid '+(loading?'fa-spinner fa-spin':playing===v.value?'fa-stop':'fa-play')} aria-hidden="true"/></button>}
    <button type="button" tabIndex={-1} className={'narrator-icon narrator-heart '+(fav?'on':'')} title={fav?'Remove from favorites (F)':'Add to favorites (F)'} aria-label={(fav?'Remove from favorites: ':'Add to favorites: ')+v.label} aria-pressed={fav} onClick={e=>{e.stopPropagation();toggleFavorite(v)}}>
     <i className={(fav?'fa-solid':'fa-regular')+' fa-heart'} aria-hidden="true"/></button>
    {!publicStudio&&v.kind!=='character'&&(()=>{const count=charactersOf(v).length,open=!!expanded[v.value+group];
     return <button type="button" tabIndex={-1} className={'narrator-icon narrator-characters '+(open?'on':'')} title={count?(open?'Hide characters':'Show characters'):'New character (impression or way of talking)'} aria-expanded={count?open:undefined}
      aria-label={count?`${open?'Hide':'Show'} ${count} character${count===1?'':'s'} of ${v.label}`:'New character for '+v.label}
      onClick={e=>{e.stopPropagation();if(count)setExpanded(o=>({...o,[v.value+group]:!open}));else{audio.current?.pause();setPlaying(null);setVariantOf(v)}}}>
      <i className="fa-solid fa-masks-theater" aria-hidden="true"/>{count>0&&<span className="narrator-count">{count}</span>}</button>})()}
    <button type="button" tabIndex={-1} className="narrator-icon narrator-add" disabled={!!v.locked} title={v.locked?'Requires Humperdinck Pro':'Use for this section (Enter)'} aria-label={v.locked?'Pro required for '+v.label:'Use '+v.label+' for this section'} onClick={e=>{e.stopPropagation();choose(v)}}>
     <i className={'fa-solid '+(v.locked?'fa-lock':currentKey===v.value?'fa-check':'fa-plus')} aria-hidden="true"/></button>
   </span>
  </div>;
 };
 const section=([id,title,icon,items])=><div className="narrator-group" key={id} role="group" aria-label={title}>
  <div className="narrator-group-head"><i className={'fa-solid '+icon} aria-hidden="true"/> {title}<span>{items.length}</span></div>
  {items.map(v=><React.Fragment key={id+v.value}>{row(v,id)}
   {expanded[v.value+id]&&<div className="narrator-sub" role="group" aria-label={v.label+' characters'}>
    {charactersOf(v).filter(matches).map(c=>row(c,id+'sub'))}
    <button type="button" className="narrator-new-character" onClick={()=>{audio.current?.pause();setPlaying(null);setVariantOf(v)}}><i className="fa-solid fa-plus" aria-hidden="true"/> New character for {v.label}</button>
   </div>}</React.Fragment>)}
 </div>;

 const dialogRef=useDialogFocus();
 return <div className="narrator-modal-backdrop" onKeyDown={onModalKey} onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="narrator-modal narrator-picker" ref={dialogRef} role="dialog" aria-modal="true" aria-label={'Choose narrator for section '+sectionNumber}>
   <div className="narrator-modal-head"><div><h3>Section {sectionNumber} narrator</h3><p>Choose a voice for this section. Unassigned following sections will inherit it.</p></div><button type="button" className="narrator-close" onClick={onClose} aria-label="Close narrator selector"><i className="fa-solid fa-xmark"/></button></div>
   <div className="narrator-current"><span className="narrator-avatar"><i className={'fa-solid '+(selected?ICONS[selected.kind]:'fa-microphone-lines')}/></span><div><strong>{selected?.label||'No narrator selected'}</strong><small>{selected?.accent||'Select a voice from the library below.'}</small></div></div>
   <label className="narrator-search"><i className="fa-solid fa-magnifying-glass" aria-hidden="true"/><input ref={searchBox} autoFocus value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={onSearchKey} placeholder="Search voices" aria-label="Search narrator voices"/></label>
   {chipChoices.length>1&&<div className="narrator-chips" role="group" aria-label="Filter voices">
    {chipChoices.map(c=><button type="button" key={c.id} aria-pressed={chips.includes(c.id)} className={'narrator-chip '+(chips.includes(c.id)?'on':'')} onClick={()=>setChips(o=>o.includes(c.id)?o.filter(x=>x!==c.id):[...o,c.id])}>{c.label}</button>)}
    {chips.length>0&&<button type="button" className="narrator-chip clear" onClick={()=>setChips([])}>Clear filters</button>}
   </div>}
   <div className="narrator-options" role="listbox" aria-label="Voices" ref={list} onKeyDown={onListKey}>
    {total?<>{top.map(section)}{groups.map(section)}</>:<p className="hint">No voices match. Try a different search or clear the filters.</p>}
   </div>
   <div className="narrator-modal-footer">
    <button type="button" onClick={()=>choose(null)}>Clear narrator</button>
    {!publicStudio&&onOpenGallery&&<button type="button" className="narrator-gallery-link" onClick={onOpenGallery}><i className="fa-solid fa-store" aria-hidden="true"/> Get more voices</button>}
    <button type="button" onClick={onClose}>Cancel</button>
   </div>
   <p className="narrator-keys">↑ ↓ move · Enter pick · Space preview · F favorite</p>
  </div>
  {variantOf&&<CharacterVoice api={api} source={variantOf} onOpenModels={onOpenModels} onClose={()=>setVariantOf(null)}
   onCreated={async c=>{setVariantOf(null);await onVoiceCreated?.();choose({value:'character:'+c.id})}}/>}
 </div>;
}
