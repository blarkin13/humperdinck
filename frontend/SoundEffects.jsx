import React,{useEffect,useMemo,useRef,useState} from 'react';
import {useNotifications} from './Notifications.jsx';
import {suggestSoundEffects} from './soundSuggestions.js';

const CATEGORIES=['All','Rain','Weather','Wind','Water','Forest','Birds','Insects','Wildlife','Nature','Atmosphere','People','Machines','Impacts','Music','Other'];
const FORMATS='.wav,.mp3,.flac,.ogg,.m4a,.aac,.webm,.zip';
const clock=seconds=>{
 const n=Math.max(0,Math.floor(Number(seconds)||0));
 return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
};
const sortBy=(items,sort)=>{
 const copy=[...items];
 if(sort==='name')copy.sort((a,b)=>a.name.localeCompare(b.name));
 else if(sort==='short')copy.sort((a,b)=>a.duration-b.duration||a.name.localeCompare(b.name));
 else if(sort==='long')copy.sort((a,b)=>b.duration-a.duration||a.name.localeCompare(b.name));
 else if(sort==='recent')copy.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
 else copy.sort((a,b)=>Number(Boolean(b.favorite))-Number(Boolean(a.favorite))||
     Number(a.origin!=='starter')-Number(b.origin!=='starter')||a.name.localeCompare(b.name));
 return copy;
};

function Waveform({item,progress,onSeek}){
 const peaks=item.waveform?.length===56?item.waveform:Array.from({length:56},()=>.23);
 return <div className="sound-wave-track">
  <div className="sound-wave-bars" aria-hidden="true">{peaks.map((peak,i)=><span key={i}
   className={(i/peaks.length<=progress?'played ':'')+'sound-wave-bar'}
   style={{height:Math.max(8,Math.round(peak*100))+'%'}}/>)}</div>
  <input type="range" min="0" max="1000" step="1"
    value={Math.round(progress*1000)}
    onChange={e=>onSeek(Number(e.target.value)/1000)}
    aria-label={'Seek in '+item.name} title="Seek through sound"/>
 </div>;
}

export default function SoundEffects({api,onInsert=null,onAmbience=null,suggestText='',compact=false,sectionId=null,refreshKey=0,disabled=false}){
 const {notify,confirm}=useNotifications();
 const [items,setItems]=useState([]),[loading,setLoading]=useState(!disabled);
 const [query,setQuery]=useState(''),[category,setCategory]=useState('All'),
       [duration,setDuration]=useState('all'),[sort,setSort]=useState('featured'),
       [favoritesOnly,setFavoritesOnly]=useState(false);
 const [uploading,setUploading]=useState(false),[editing,setEditing]=useState(null),
       [editName,setEditName]=useState(''),[editCategory,setEditCategory]=useState('Other');
 const [position,setPosition]=useState('after'),[volume,setVolume]=useState(80),
       [fadeIn,setFadeIn]=useState(0),[fadeOut,setFadeOut]=useState(0);
 const [showSuggestions,setShowSuggestions]=useState(false),[suggesting,setSuggesting]=useState(false),
       [modelSuggestions,setModelSuggestions]=useState(null),[suggestionSource,setSuggestionSource]=useState('keywords');
 const fileRef=useRef(null),audioRef=useRef(null);
 const [playing,setPlaying]=useState(null),[currentTime,setCurrentTime]=useState(0);
 async function load(){
  if(disabled)return;
  setLoading(true);
  try{setItems(await api('sound-effects'))}
  catch(err){notify(err.message,'error')}
  finally{setLoading(false)}
 }
 useEffect(()=>{load()},[refreshKey,disabled]);
 useEffect(()=>()=>{audioRef.current?.pause()},[]);
 useEffect(()=>{setModelSuggestions(null);setSuggestionSource('keywords')},[suggestText]);
 useEffect(()=>{
  if(editing===null)return;
  const handler=e=>{if(e.key==='Escape')setEditing(null)};
  window.addEventListener('keydown',handler);
  return()=>window.removeEventListener('keydown',handler);
 },[editing]);

 async function upload(files){
  if(!files?.length||disabled)return;
  setUploading(true);
  for(const file of files){
   const form=new FormData();form.append('file',file);
   try{
    if(file.name.toLowerCase().endsWith('.zip')){
     const result=await api('sound-effects/import-pack',{method:'POST',body:form});
     notify('Imported '+result.count+' recordings'+(result.skipped.length?' ('+result.skipped.length+' already present)':''),'success');
    }else{
     const item=await api('sound-effects',{method:'POST',body:form});
     notify('Imported '+item.name,'success');
    }
   }catch(err){notify(err.message,'error')}
  }
  await load();setUploading(false);
 }

 function preview(item){
  const audio=audioRef.current;
  if(!audio)return;
  if(playing===item.id){audio.pause();audio.currentTime=0;setPlaying(null);setCurrentTime(0);return}
  audio.pause();setPlaying(null);setCurrentTime(0);
  audio.src='/api/sound-effects/'+item.id+'/audio';
  audio.currentTime=0;
  audio.play().then(()=>setPlaying(item.id)).catch(()=>notify('Unable to play '+item.name,'error'));
 }
 function seek(item,fraction){
  const audio=audioRef.current;
  if(!audio)return;
  const seconds=Math.min(1,Math.max(0,fraction))*item.duration;
  if(playing===item.id){audio.currentTime=seconds;setCurrentTime(seconds)}
  else{preview(item);audio.addEventListener('loadedmetadata',()=>{audio.currentTime=seconds;setCurrentTime(seconds)},{once:true})}
 }

 async function favorite(item){
  try{
   const value=!item.favorite;
   setItems(old=>old.map(v=>v.id===item.id?{...v,favorite:value}:v));
   await api('sound-effects/'+item.id,{method:'PATCH',
       headers:{'Content-Type':'application/json'},body:JSON.stringify({favorite:value})});
  }catch(err){await load();notify(err.message,'error')}
 }
 function edit(item){setEditing(item.id);setEditName(item.name);setEditCategory(item.category||'Other')}
 async function saveEdit(){
  try{
   await api('sound-effects/'+editing,{method:'PATCH',
       headers:{'Content-Type':'application/json'},
       body:JSON.stringify({name:editName,category:editCategory})});
   setEditing(null);await load();notify('Sound details saved','success');
  }catch(err){notify(err.message,'error')}
 }
 async function remove(item){
  if(!await confirm('Delete "'+item.name+'" from your library?',{
     title:'Delete sound effect',danger:true,confirmLabel:'Delete'}))return;
  try{
   await api('sound-effects/'+item.id,{method:'DELETE'});
   if(playing===item.id){audioRef.current?.pause();setPlaying(null)}
   await load();notify('Sound effect deleted','success');
  }catch(err){notify(err.message,'error')}
 }

 const fallbackSuggestions=suggestSoundEffects(suggestText,items);
 const suggested=modelSuggestions??fallbackSuggestions;
 async function toggleSuggestions(){
  if(showSuggestions){setShowSuggestions(false);return}
  setShowSuggestions(true);
  if(!suggestText?.trim())return;
  setSuggesting(true);
  try{
   const result=await api('sound-effects/suggest',{method:'POST',
     headers:{'Content-Type':'application/json'},body:JSON.stringify({text:suggestText})});
   const found=result.suggestions.map(choice=>{
    const item=items.find(sound=>sound.id===choice.sound_id);
    return item?{...item,reason:choice.reason}:null;
   }).filter(Boolean);
   setModelSuggestions(found);setSuggestionSource(result.source);
  }catch(err){
   setModelSuggestions(null);setSuggestionSource('keywords');
   notify('Using offline matching: '+err.message,'info');
  }finally{setSuggesting(false)}
 }

 const categories=useMemo(()=>{
  const present=new Set(items.map(item=>item.category));
  return CATEGORIES.filter(cat=>cat==='All'||present.has(cat));
 },[items]);
 const filtered=useMemo(()=>sortBy(items.filter(item=>{
  const searchable=[item.name,item.category,...(item.tags||[])].join(' ').toLowerCase();
  if(query.trim()&&!searchable.includes(query.trim().toLowerCase()))return false;
  if(category!=='All'&&item.category!==category)return false;
  if(favoritesOnly&&!item.favorite)return false;
  if(duration==='short'&&item.duration>=10)return false;
  if(duration==='medium'&&(item.duration<10||item.duration>30))return false;
  if(duration==='long'&&item.duration<=30)return false;
  return true;
 }),sort),[items,query,category,favoritesOnly,duration,sort]);

 return <div className={'sound-library sound-library-pixabay '+(compact?'sound-library-compact':'')}>
  <div className="sound-library-head">
   <div>{!compact&&<><h2>Sound Effects</h2>
    <p>Browse and preview your real recordings. Import nature sounds you own or have permission to use.</p></>}</div>
   {!compact&&<a className="sound-browse-reference" href="https://commons.wikimedia.org/wiki/Category:Sounds_of_nature" target="_blank" rel="noopener noreferrer" title="Browse freely licensed nature recordings on Wikimedia Commons; check each file's license before importing">
     <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"/> Browse field recordings</a>}
   <button className="sound-import" type="button" disabled={disabled||uploading}
      onClick={()=>fileRef.current?.click()} title="Import sound effects">
    <i className={'fa-solid '+(uploading?'fa-spinner fa-spin':'fa-file-import')} aria-hidden="true"/>
    <span>{uploading?'Importing':'Import sounds'}</span>
   </button>
   <input ref={fileRef} type="file" multiple hidden accept={FORMATS}
     onChange={e=>{upload(Array.from(e.target.files));e.target.value=''}}/>
  </div>
  {disabled?<p className="hint">The Sound Effects Library is available in the desktop app.</p>:<>
   <div className="sound-search-shell">
    <i className="fa-solid fa-magnifying-glass" aria-hidden="true"/>
    <input type="search" value={query} onChange={e=>setQuery(e.target.value)}
     aria-label="Search sound effects" placeholder="Search rain, forest, ocean, birds…"/>
    {query&&<button type="button" aria-label="Clear search" title="Clear search" onClick={()=>setQuery('')}><i className="fa-solid fa-xmark"/></button>}
   </div>
   <div className="sound-category-strip" role="group" aria-label="Sound categories">
    {categories.map(cat=><button type="button" key={cat}
      className={cat===category?'selected':''} aria-pressed={cat===category}
      onClick={()=>setCategory(cat)}>{cat}</button>)}
   </div>
   <div className="sound-library-options">
    <span className="sound-result-count">{filtered.length} {filtered.length===1?'sound':'sounds'}{items.some(item=>item.origin==='starter')&&!compact?' · original starter library':''}</span>
    <div className="sound-option-actions">
     <button type="button" className={'sound-favorites-toggle '+(favoritesOnly?'selected':'')}
       aria-pressed={favoritesOnly} title="Only favorites" onClick={()=>setFavoritesOnly(x=>!x)}>
      <i className={favoritesOnly?'fa-solid fa-heart':'fa-regular fa-heart'} aria-hidden="true"/><span>Favorites</span>
     </button>
     <select aria-label="Filter by duration" value={duration} onChange={e=>setDuration(e.target.value)}>
      <option value="all">Any duration</option><option value="short">Under 10 seconds</option>
      <option value="medium">10–30 seconds</option><option value="long">Over 30 seconds</option>
     </select>
     <select aria-label="Sort sound effects" value={sort} onChange={e=>setSort(e.target.value)}>
      <option value="featured">Featured</option><option value="recent">Newest</option>
      <option value="name">Name A–Z</option><option value="short">Shortest</option><option value="long">Longest</option>
     </select>
    </div>
   </div>
   <audio ref={audioRef} hidden onTimeUpdate={e=>setCurrentTime(e.currentTarget.currentTime||0)}
       onEnded={()=>{setPlaying(null);setCurrentTime(0)}}
       onPause={e=>{if(e.currentTarget.ended)setPlaying(null)}}/>
   {onInsert&&suggestText?.trim()&&<div className="sound-suggestion-area">
    <button type="button" className="sound-suggest-trigger" onClick={toggleSuggestions}
      aria-expanded={showSuggestions} disabled={suggesting}>
     <i className={'fa-solid '+(suggesting?'fa-spinner fa-spin':'fa-wand-magic-sparkles')}/>
     {suggesting?'Finding sounds…':'Suggest sounds for this section'}
    </button>
    {showSuggestions&&<div className="sound-suggestions">
     <small>{suggesting?'Looking for relevant sounds…':suggestionSource==='ollama'?
      'Local AI suggestions. Review each before adding.':
      'Offline suggestions matched to your library. Review before adding.'}</small>
     {!suggesting&&suggested.length?suggested.map(item=><div className="sound-suggestion" key={item.id}>
      <div><strong>{item.name}</strong><small>Matched: {item.reason}</small></div>
      <button type="button" aria-label={'Add suggested '+item.name}
        onClick={()=>onInsert(sectionId,item,{position,volume:volume/100,fade_in:fadeIn,fade_out:fadeOut})}>
       <i className="fa-solid fa-plus"/></button>
     </div>):!suggesting&&<small>No matching sounds. Search manually or import a relevant sound.</small>}
    </div>}
   </div>}
   <div className="sound-list" role="list" aria-label="Available sounds">
    {loading?<div className="sound-loading" role="status"><i className="fa-solid fa-spinner fa-spin" aria-hidden="true"/><span>Loading sound library…</span></div>:filtered.length===0?<div className="sound-no-results">
     <i className="fa-solid fa-wave-square"/><strong>{items.length?'No matching sounds':'No recordings imported yet'}</strong>
     <span>{items.length?'Try another search or category.':'Import genuine nature recordings to start building your own sound library.'}</span>
     {items.length?<button type="button" onClick={()=>{setQuery('');setCategory('All');setDuration('all');setFavoritesOnly(false)}}>Clear filters</button>:
      <div className="sound-empty-import-actions">
       <button type="button" onClick={()=>fileRef.current?.click()}><i className="fa-solid fa-file-import"/> Import recordings</button>
       <a href="https://commons.wikimedia.org/wiki/Category:Sounds_of_nature" target="_blank" rel="noopener noreferrer">Find freely licensed recordings</a>
      </div>}
    </div>:filtered.map(item=>{
     const on=playing===item.id;
     const progress=on?Math.min(1,currentTime/(item.duration||1)):0;
     return <div className={'sound-list-row '+(on?'is-playing':'')} role="listitem" key={item.id}>
      <button type="button" className="sound-row-play" aria-label={(on?'Stop':'Play')+' '+item.name}
       title={on?'Stop preview':'Play preview'} onClick={()=>preview(item)}>
       <i className={'fa-solid '+(on?'fa-stop':'fa-play')} aria-hidden="true"/></button>
      <div className="sound-row-details">
       <strong title={item.name}>{item.name}</strong>
       <span>{item.category||'Other'}<span className="sound-source-dot">·</span>{item.origin==='starter'||item.origin==='curated-cc0'?'Included':'My upload'}{item.creator?' · '+item.creator:''}</span>
      </div>
      <Waveform item={item} progress={progress} onSeek={fraction=>seek(item,fraction)}/>
      <span className="sound-row-time" aria-label={'Duration '+clock(item.duration)}>
       {on?clock(currentTime)+' / ':''}{clock(item.duration)}
      </span>
      <div className="sound-row-actions">
       <button type="button" className={'sound-fav-button '+(item.favorite?'is-favorite':'')}
          aria-label={(item.favorite?'Remove from':'Add to')+' favorites: '+item.name}
          title={item.favorite?'Remove from favorites':'Favorite'}
          onClick={()=>favorite(item)}><i className={item.favorite?'fa-solid fa-heart':'fa-regular fa-heart'}/></button>
       {onInsert?<button type="button" className="sound-row-primary" title="Add to section" aria-label={'Add '+item.name+' to section'}
         onClick={()=>onInsert(sectionId,item,{position,volume:volume/100,fade_in:fadeIn,fade_out:fadeOut})}><i className="fa-solid fa-plus"/></button>:
        onAmbience?<button type="button" className="sound-row-primary" title="Use as ambience" aria-label={'Use '+item.name+' as ambience'}
         onClick={()=>onAmbience(item)}><i className="fa-solid fa-check"/></button>:
        <a className="sound-row-primary" title={'Download '+item.name} aria-label={'Download '+item.name}
         href={'/api/sound-effects/'+item.id+'/audio'} download={item.name.replace(/[^a-z0-9-]/gi,'-')+'.wav'}><i className="fa-solid fa-download"/></a>}
       {!compact&&<details className="sound-row-menu">
        <summary aria-label={'More options for '+item.name} title="More options"><i className="fa-solid fa-ellipsis-vertical"/></summary>
        <div className="sound-row-dropdown">
         <button type="button" onClick={e=>{e.currentTarget.closest('details').open=false;edit(item)}}>
          <i className="fa-solid fa-pen"/> Rename / categorize</button>
         <button type="button" className="sound-menu-danger" onClick={e=>{e.currentTarget.closest('details').open=false;remove(item)}}>
          <i className="fa-solid fa-trash-can"/> Delete sound</button>
        </div>
       </details>}
      </div>
     </div>;
    })}
   </div>
   {editing!==null&&<div className="sound-edit-modal-backdrop"
       onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(null)}}>
    <form className="sound-edit-modal" role="dialog" aria-modal="true"
      aria-label="Edit sound details" onSubmit={e=>{e.preventDefault();saveEdit()}}>
     <h3>Edit sound effect</h3>
     <label>Sound name<input maxLength="120" required value={editName} onChange={e=>setEditName(e.target.value)}/></label>
     <label>Category<select value={CATEGORIES.includes(editCategory)?editCategory:'Other'}
       onChange={e=>setEditCategory(e.target.value)}>
       {CATEGORIES.slice(1).map(cat=><option key={cat} value={cat}>{cat}</option>)}
      </select></label>
     <div className="sound-edit-actions"><button type="button" onClick={()=>setEditing(null)}>Cancel</button>
      <button className="primary" type="submit">Save</button></div>
    </form>
   </div>}
   {onInsert&&<div className="sound-insert-settings">
    <label>Position<select value={position} onChange={e=>setPosition(e.target.value)}>
     <option value="before">Before narration</option><option value="after">After narration</option>
    </select></label>
    <label>Volume <span>{volume}%</span><input type="range" min="0" max="150" step="5"
      value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label>
    <label>Fade in <input type="number" aria-label="Effect fade in seconds" min="0" max="10" step="0.1"
      value={fadeIn} onChange={e=>setFadeIn(Math.max(0,Math.min(10,Number(e.target.value)||0)))}/> s</label>
    <label>Fade out <input type="number" aria-label="Effect fade out seconds" min="0" max="10" step="0.1"
      value={fadeOut} onChange={e=>setFadeOut(Math.max(0,Math.min(10,Number(e.target.value)||0)))}/> s</label>
   </div>}
  </>}
 </div>;
}
