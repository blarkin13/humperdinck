import React,{useEffect,useRef,useState} from 'react';
import {useNotifications} from './Notifications.jsx';

const TYPES=['All','Atmosphere','Nature','Weather','People','Machines','Impacts','Music','Other'];
export default function SoundEffects({api,onInsert=null,compact=false,sectionId=null,refreshKey=0,disabled=false}){
 const {notify,confirm}=useNotifications();
 const [items,setItems]=useState([]),[query,setQuery]=useState(''),[category,setCategory]=useState('All'),[uploading,setUploading]=useState(false),[selected,setSelected]=useState(null),[editing,setEditing]=useState(null),[editName,setEditName]=useState(''),[editCategory,setEditCategory]=useState('Other'),[position,setPosition]=useState('after'),[volume,setVolume]=useState(80);
 const fileRef=useRef(null),audioRef=useRef(null),[playing,setPlaying]=useState(null);
 async function load(){
  if(disabled)return;
  try{setItems(await api('sound-effects'))}catch(err){notify(err.message,'error')}
 }
 useEffect(()=>{load()},[refreshKey,disabled]);
 useEffect(()=>()=>{audioRef.current?.pause()},[]);
 async function upload(files){
  if(!files?.length||disabled)return;
  setUploading(true);
  for(const file of files){
   const form=new FormData();form.append('file',file);
   try{
    const item=await api('sound-effects',{method:'POST',body:form});
    notify('Imported '+item.name,'success');
   }catch(err){notify(err.message,'error')}
  }
  await load();setUploading(false);
 }
 function preview(item){
  if(playing===item.id){audioRef.current?.pause();setPlaying(null);return}
  if(!audioRef.current)return;
  audioRef.current.src='/api/sound-effects/'+item.id+'/audio';
  audioRef.current.play().then(()=>setPlaying(item.id)).catch(()=>notify('Unable to play the selected sound','error'));
 }
 function edit(item){setEditing(item.id);setEditName(item.name);setEditCategory(item.category||'Other')}
 async function saveEdit(){
  try{await api('sound-effects/'+editing,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:editName,category:editCategory})});setEditing(null);await load();notify('Sound details saved','success')}
  catch(err){notify(err.message,'error')}
 }
 async function remove(item){
  if(!await confirm('Delete "'+item.name+'" from your library?',{title:'Delete sound effect',danger:true,confirmLabel:'Delete'}))return;
  try{await api('sound-effects/'+item.id,{method:'DELETE'});if(playing===item.id)audioRef.current?.pause();await load();notify('Sound effect deleted','success')}catch(err){notify(err.message,'error')}
 }
 const filtered=items.filter(item=>(category==='All'||item.category===category)&&(!query||item.name.toLowerCase().includes(query.toLowerCase())||(item.category||'').toLowerCase().includes(query.toLowerCase())));
 return <div className={'sound-library '+(compact?'sound-library-compact':'')}>
  <div className="sound-library-head">
   <div>{!compact&&<><h2>Sound Effects</h2><p>Import and organize your own licensed sounds. Play them or add them to narration.</p></>}</div>
   <button className="sound-import" type="button" disabled={disabled||uploading} onClick={()=>fileRef.current?.click()} title="Import sound effects"><i className={'fa-solid '+(uploading?'fa-spinner fa-spin':'fa-file-import')}/><span>{uploading?'Importing':'Import sounds'}</span></button>
   <input ref={fileRef} type="file" multiple hidden accept=".wav,.mp3,.flac,.ogg,.m4a,.aac,.webm" onChange={e=>{upload(Array.from(e.target.files));e.target.value=''}}/>
  </div>
  {disabled?<p className="hint">The Sound Effects Library is available in the desktop app.</p>:<>
  <div className="sound-filters">
   <label><i className="fa-solid fa-magnifying-glass" aria-hidden="true"/><input aria-label="Search sounds" placeholder="Search sound effects" value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <select aria-label="Filter sound category" value={category} onChange={e=>setCategory(e.target.value)}>{TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select>
  </div>
  <audio ref={audioRef} hidden onEnded={()=>setPlaying(null)} onPause={()=>setPlaying(null)}/>
  <div className="sound-items">
   {filtered.length===0?<p className="sound-empty">{items.length?'No sounds match your search.':'Your sound library is empty. Import WAV, MP3 or another supported audio file to begin.'}</p>:filtered.map(item=><div className={'sound-item '+(selected===item.id?'selected':'')} key={item.id}>
    <button type="button" className="sound-preview" title={playing===item.id?'Stop preview':'Preview sound'} aria-label={(playing===item.id?'Stop':'Preview')+' '+item.name} onClick={()=>preview(item)}><i className={'fa-solid '+(playing===item.id?'fa-stop':'fa-play')}/></button>
    <button type="button" className="sound-item-title" onClick={()=>setSelected(id=>id===item.id?null:item.id)} aria-expanded={selected===item.id}><strong>{item.name}</strong><small>{item.category||'Other'} · {item.duration}s</small></button>
    {onInsert?<button type="button" className="sound-insert" onClick={()=>onInsert(sectionId,item,{position,volume:volume/100})} title={'Add '+item.name+' to section'} aria-label={'Add '+item.name+' to section'}><i className="fa-solid fa-plus"/></button>:<button type="button" className="sound-item-menu" onClick={()=>edit(item)} title="Rename or categorize" aria-label={'Edit '+item.name}><i className="fa-solid fa-pen"/></button>}
    {!compact&&<button type="button" className="sound-item-delete" onClick={()=>remove(item)} title={'Delete '+item.name} aria-label={'Delete '+item.name}><i className="fa-solid fa-trash-can"/></button>}
   </div>)}
  </div>
  {editing!==null&&<div className="sound-edit-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditing(null)}}>
    <form className="sound-edit-modal" role="dialog" aria-modal="true" aria-label="Edit sound details" onSubmit={e=>{e.preventDefault();saveEdit()}}>
     <h3>Edit sound effect</h3>
     <label>Sound name<input maxLength="120" required value={editName} onChange={e=>setEditName(e.target.value)}/></label>
     <label>Category<select value={TYPES.includes(editCategory)?editCategory:'Other'} onChange={e=>setEditCategory(e.target.value)}>{TYPES.slice(1).map(t=><option key={t}>{t}</option>)}</select></label>
     <div className="sound-edit-actions"><button type="button" onClick={()=>setEditing(null)}>Cancel</button><button className="primary" type="submit">Save</button></div>
    </form>
   </div>}
  {onInsert&&<div className="sound-insert-settings"><label>Position<select value={position} onChange={e=>setPosition(e.target.value)}><option value="before">Before narration</option><option value="after">After narration</option></select></label><label>Volume <span>{volume}%</span><input type="range" min="0" max="150" step="5" value={volume} onChange={e=>setVolume(Number(e.target.value))}/></label></div>}
  </>}
 </div>;
}
