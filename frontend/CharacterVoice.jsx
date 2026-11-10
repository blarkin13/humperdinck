import {useDialogFocus} from './useDialogFocus.js';
import React,{useEffect,useRef,useState} from 'react';

// A character is the original voice doing an impression (Kokoro style blend, or a
// Qwen speaker-embedding blend for recorded/designed voices) or a described way of talking.
// Its name is only a label. Accents were removed: current models can't keep the
// original voice while adding a real accent.
const SAMPLE='Gather round, and I will tell you how it all began, on the old road north.';
const CUSTOM='__custom__';
const post=body=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

export default function CharacterVoice({api,source,onClose,onCreated,onOpenModels}){
 const [options,setOptions]=useState(null),[nameChoice,setNameChoice]=useState('Narrator'),[customName,setCustomName]=useState('');
 const [impression,setImpression]=useState(''),[direction,setDirection]=useState(''),[gender,setGender]=useState(source.gender||'female');
 const [text,setText]=useState(SAMPLE),[job,setJob]=useState(null),[pick,setPick]=useState(0),[playing,setPlaying]=useState(null);
 const [busy,setBusy]=useState(''),[error,setError]=useState('');
 const audio=useRef(null),requested=useRef('');
 useEffect(()=>{api('characters/options?source_key='+encodeURIComponent(source.value)).then(o=>{setOptions(o);setImpression(o.impressions?.[0]?.voice||'')}).catch(e=>setError(e.message));return()=>audio.current?.pause()},[]);

 const impressions=options?.impressions||[],canImpress=impressions.length>0;
 const recipe=[impression,direction.trim(),gender,text].join('|');
 const name=(nameChoice===CUSTOM?customName:nameChoice).trim();
 const takes=job?.takes||[];
 const ready=job?.status==='complete'&&takes[pick]?.status==='complete'&&requested.current===recipe;
 const target=impressions.find(t=>t.voice===impression);
 // Voices with impression targets do impressions; others need a described way of talking.
 const needsDesigner=!canImpress;
 const canMake=canImpress?!!impression:!!direction.trim()&&!!options?.converter_ready;

 function play(i,url){
  audio.current?.pause();
  if(playing===i){setPlaying(null);return}
  const a=new Audio(url+'?t='+Date.now());a.onended=()=>setPlaying(null);a.play().catch(()=>setPlaying(null));
  audio.current=a;setPlaying(i);
 }
 async function makeTakes(){
  setError('');setBusy('takes');setPlaying(null);audio.current?.pause();requested.current=recipe;setPick(0);
  try{
   let j=await api('characters/takes',post(canImpress?{source_key:source.value,impression,text}:{source_key:source.value,direction,gender,text}));
   setJob(j);
   for(let n=0;!['complete','failed'].includes(j.status)&&n<3600;n++){await new Promise(r=>setTimeout(r,1000));j=await api('jobs/'+j.job_id);setJob(j)}
   if(j.status!=='complete')throw Error(j.message||'Could not make takes');
  }catch(e){setError(e.message)}finally{setBusy('')}
 }
 async function save(){
  setError('');setBusy('save');
  try{
   const c=await api('characters',post({source_key:source.value,name,direction:canImpress?'':direction,gender,job_id:job.job_id,take:pick}));
   await onCreated(c);
  }catch(e){setError(e.message);setBusy('')}
 }

 const dialogRef=useDialogFocus();
 return <div className="narrator-modal-backdrop character-backdrop" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}}} onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="narrator-modal character-voice" ref={dialogRef} role="dialog" aria-modal="true" aria-label={'New character for '+source.label}>
   <div className="narrator-modal-head"><div><h3><i className="fa-solid fa-masks-theater" aria-hidden="true"/> New character</h3><p><strong>{source.label}</strong> doing a character, the way a narrator does impressions.</p></div><button type="button" className="narrator-close" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark"/></button></div>
   <div className="character-body">
    {options&&!canImpress&&!options.converter_ready&&<div className="notice">Characters need the <strong>Character voices</strong> converter (about 130 MB plus PyTorch). {onOpenModels&&<button type="button" className="link" onClick={onOpenModels}>Install it in Models</button>}</div>}
    <label>Character name <small>(just a label)</small>
     <select value={nameChoice} onChange={e=>setNameChoice(e.target.value)}>{(options?.names||['Narrator']).map(n=><option key={n}>{n}</option>)}<option value={CUSTOM}>Custom…</option></select>
    </label>
    {nameChoice===CUSTOM&&<input aria-label="Custom character name" autoFocus maxLength={80} value={customName} onChange={e=>setCustomName(e.target.value)} placeholder="e.g. Captain Mira"/>}
    {canImpress?<label>Impersonating<select value={impression} onChange={e=>setImpression(e.target.value)}>
     {[...new Set(impressions.map(t=>t.group))].map(g=><optgroup key={g} label={g}>{impressions.filter(t=>t.group===g).map(t=><option key={t.voice} value={t.voice}>{t.name}</option>)}</optgroup>)}
    </select></label>
    :<label>How they talk<textarea rows={2} maxLength={400} value={direction} onChange={e=>setDirection(e.target.value)} placeholder="e.g. old and slow, gravelly, whispering, excited"/></label>}
    {!canImpress&&!source.gender&&<label>The original voice is<select value={gender} onChange={e=>setGender(e.target.value)}><option value="female">Female</option><option value="male">Male</option><option value="neutral">Neither / unsure</option></select></label>}
    <p className="hint">{canImpress?`${source.label} impersonates ${target?.name||'another voice'}: still ${source.label}, pushed toward their voice. You get a subtle, medium and strong take.`
     :`The voice designer performs the line from your description, then it's turned into ${source.label}'s voice.`}</p>
    {needsDesigner&&options&&!options.design_ready&&<div className="notice">This needs the voice designer. Install it in Models.</div>}
    <label>Preview line<input value={text} maxLength={300} onChange={e=>setText(e.target.value)}/></label>
    {job&&requested.current===recipe&&<div className="character-takes" role="radiogroup" aria-label="Takes">
     <small>{job.status==='complete'?'Pick the take that sounds best.':job.status==='failed'?'':job.message||'Working…'}</small>
     {takes.map((t,i)=><div key={i} className={'character-take '+(pick===i?'on':'')}>
      <label><input type="radio" name="take" checked={pick===i} disabled={t.status!=='complete'} onChange={()=>setPick(i)}/> {t.label||options?.impression_strengths?.[i]&&canImpress&&options.impression_strengths[i]||'Take '+(i+1)}</label>
      {t.status==='complete'?<button type="button" onClick={()=>play(i,t.url)} aria-label={(playing===i?'Stop take ':'Play take ')+(i+1)}><i className={'fa-solid '+(playing===i?'fa-stop':'fa-play')} aria-hidden="true"/></button>
       :<small>{job.status==='failed'?'—':'Waiting…'}</small>}
     </div>)}
    </div>}
    {error&&<p className="character-error">{error}</p>}
   </div>
   <div className="narrator-modal-footer">
    <button type="button" onClick={onClose}>Cancel</button>
    <span className="character-actions">
     <button type="button" disabled={!canMake||!!busy||!text.trim()} onClick={makeTakes}><i className={'fa-solid '+(busy==='takes'?'fa-spinner fa-spin':'fa-play')} aria-hidden="true"/> {busy==='takes'?'Making takes…':ready?'New takes':'Make 3 takes'}</button>
     <button type="button" className="primary" disabled={!ready||!name||!!busy} title={ready?'':'Make takes first'} onClick={save}>{busy==='save'?'Saving…':ready?(takes[pick]?.label?`Save ${takes[pick].label.toLowerCase()} take`:`Save take ${pick+1}`):'Save'}</button>
    </span>
   </div>
  </div>
 </div>;
}
