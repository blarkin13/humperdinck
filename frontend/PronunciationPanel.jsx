import React,{useEffect,useState} from 'react';
import {useNotifications} from './Notifications.jsx';

/** Teach every voice how to say a word: "YOLO" is spoken as "yoh-loh". */
export default function PronunciationPanel({api}){
 const {notify}=useNotifications();
 const [entries,setEntries]=useState([]),[saved,setSaved]=useState('[]'),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);
 useEffect(()=>{if(!open)return;api('pronunciations').then(r=>{setEntries(r.entries);setSaved(JSON.stringify(r.entries))}).catch(e=>notify(e.message,'error'))},[open]);
 const dirty=JSON.stringify(entries.filter(e=>e.word.trim()&&e.say.trim()))!==saved;
 const change=(i,key,value)=>setEntries(list=>list.map((e,n)=>n===i?{...e,[key]:value}:e));
 async function save(){setBusy(true);try{
  const r=await api('pronunciations',{method:'PUT',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({entries:entries.filter(e=>e.word.trim()&&e.say.trim())})});
  setEntries(r.entries);setSaved(JSON.stringify(r.entries));
  notify('Pronunciations saved. They apply the next time you generate.','success');
 }catch(e){notify(e.message,'error')}finally{setBusy(false)}}
 return <details className="panel pronunciation-panel" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary><i className="fa-solid fa-spell-check" aria-hidden="true"/> Pronunciations{saved!=='[]'&&` · ${JSON.parse(saved).length}`}</summary>
  <p className="hint">Teach every voice how to say a word. Write it how it should sound, for example <strong>YOLO</strong> → <strong>yoh-loh</strong>. Whole words only; capitals don't matter. Applies to Narration Studio, Video Studio and previews.</p>
  {entries.map((e,i)=><div className="pronunciation-row" key={i}>
   <input aria-label={'Word '+(i+1)} placeholder="Word or phrase" maxLength={60} value={e.word} onChange={ev=>change(i,'word',ev.target.value)}/>
   <i className="fa-solid fa-arrow-right" aria-hidden="true"/>
   <input aria-label={'Say '+(e.word||'word '+(i+1))+' as'} placeholder="Say it as" maxLength={120} value={e.say} onChange={ev=>change(i,'say',ev.target.value)}/>
   <button type="button" aria-label={'Remove '+(e.word||'word '+(i+1))} title="Remove" onClick={()=>setEntries(list=>list.filter((_,n)=>n!==i))}><i className="fa-solid fa-trash-can" aria-hidden="true"/></button>
  </div>)}
  <div className="actions">
   <button type="button" disabled={entries.length>=500} onClick={()=>setEntries(list=>[...list,{word:'',say:''}])}><i className="fa-solid fa-plus" aria-hidden="true"/> Add word</button>
   <button type="button" className="primary" disabled={busy||!dirty} onClick={save}><i className={'fa-solid '+(busy?'fa-spinner fa-spin':'fa-floppy-disk')} aria-hidden="true"/> Save</button>
  </div>
 </details>;
}
