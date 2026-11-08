import React,{useEffect,useRef,useState} from 'react';
import CharacterVoice from './CharacterVoice.jsx';

// The characters that belong to one voice, opened from its Voice Library card.
export default function CharactersPanel({api,source,characters,onChanged,onUse,onClose,onOpenModels,askConfirm}){
 const [creating,setCreating]=useState(false),[playing,setPlaying]=useState(null),[editing,setEditing]=useState(null),[draft,setDraft]=useState(''),[error,setError]=useState('');
 const audio=useRef(null);
 const mine=characters.filter(c=>c.source_key===source.value);
 useEffect(()=>()=>audio.current?.pause(),[]);
 function play(c){
  audio.current?.pause();
  if(playing===c.id){setPlaying(null);return}
  const a=new Audio('/api/characters/'+c.id+'/sample.wav');a.onended=()=>setPlaying(null);a.play().catch(()=>setPlaying(null));
  audio.current=a;setPlaying(c.id);
 }
 async function rename(c){
  const name=draft.trim();setEditing(null);
  if(!name||name===c.name)return;
  try{await api('characters/'+c.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});await onChanged()}catch(e){setError(e.message)}
 }
 async function remove(c){
  if(askConfirm&&!await askConfirm(`Delete the character "${c.name}"?`,{title:'Delete character',confirmLabel:'Delete',danger:true}))return;
  try{await api('characters/'+c.id,{method:'DELETE'});await onChanged()}catch(e){setError(e.message)}
 }
 return <div className="narrator-modal-backdrop" onKeyDown={e=>{if(e.key==='Escape'&&!creating){e.stopPropagation();onClose()}}} onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="narrator-modal characters-panel" role="dialog" aria-modal="true" aria-label={source.label+' characters'}>
   <div className="narrator-modal-head"><div><h3><i className="fa-solid fa-masks-theater" aria-hidden="true"/> {source.label} · characters</h3><p>The same voice with different accents and ways of talking.</p></div><button type="button" className="narrator-close" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark"/></button></div>
   <div className="narrator-options">
    {mine.length?mine.map(c=><div className="narrator-option" key={c.id}>
     <span className="narrator-avatar"><i className="fa-solid fa-masks-theater" aria-hidden="true"/></span>
     <span className="narrator-option-text">{editing===c.id
      ?<input autoFocus aria-label="Character name" value={draft} maxLength={80} onChange={e=>setDraft(e.target.value)} onBlur={()=>rename(c)} onKeyDown={e=>{if(e.key==='Enter')rename(c);if(e.key==='Escape'){e.stopPropagation();setEditing(null)}}}/>
      :<strong>{c.name}</strong>}
      <small>{[c.accent&&c.accent!=='Keep the original'?c.accent+' accent':'',c.direction].filter(Boolean).join(' · ')||'Original accent'}</small></span>
     <span className="narrator-option-actions">
      <button type="button" className={'narrator-icon '+(playing===c.id?'on':'')} onClick={()=>play(c)} aria-label={(playing===c.id?'Stop ':'Play ')+c.name}><i className={'fa-solid '+(playing===c.id?'fa-stop':'fa-play')}/></button>
      <button type="button" className="narrator-icon" onClick={()=>{setEditing(c.id);setDraft(c.name)}} aria-label={'Rename '+c.name} title="Rename"><i className="fa-solid fa-pen"/></button>
      <button type="button" className="narrator-icon" onClick={()=>remove(c)} aria-label={'Delete '+c.name} title="Delete"><i className="fa-solid fa-trash-can"/></button>
      {onUse&&<button type="button" className="narrator-icon narrator-add" onClick={()=>onUse('character:'+c.id)} aria-label={'Use '+c.name+' in Narration Studio'} title="Use in Narration Studio"><i className="fa-solid fa-arrow-right"/></button>}
     </span>
    </div>):<p className="hint">No characters yet. Make one to give {source.label} an accent or a way of talking.</p>}
    {error&&<p className="character-error">{error}</p>}
   </div>
   <div className="narrator-modal-footer"><button type="button" onClick={onClose}>Close</button><button type="button" className="primary" onClick={()=>setCreating(true)}><i className="fa-solid fa-plus"/> New character</button></div>
  </div>
  {creating&&<CharacterVoice api={api} source={source} onOpenModels={onOpenModels} onClose={()=>setCreating(false)} onCreated={async()=>{setCreating(false);await onChanged()}}/>}
 </div>;
}
