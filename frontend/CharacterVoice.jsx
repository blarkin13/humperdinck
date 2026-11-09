import {useDialogFocus} from './useDialogFocus.js';
import React,{useEffect,useRef,useState} from 'react';

// A character is the original voice with an accent and/or a way of talking.
// Its name is only a label; the sound comes from the accent and the direction.
const SAMPLE='Gather round, and I will tell you how it all began, on the old road north.';
const CUSTOM='__custom__';
const post=body=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

export default function CharacterVoice({api,source,onClose,onCreated,onOpenModels}){
 const [options,setOptions]=useState(null),[nameChoice,setNameChoice]=useState('Narrator'),[customName,setCustomName]=useState('');
 const [accent,setAccent]=useState('Keep the original'),[direction,setDirection]=useState(''),[gender,setGender]=useState(source.gender||'female');
 const [text,setText]=useState(SAMPLE),[job,setJob]=useState(null),[pick,setPick]=useState(0),[playing,setPlaying]=useState(null);
 const [busy,setBusy]=useState(''),[error,setError]=useState('');
 const audio=useRef(null),requested=useRef('');
 useEffect(()=>{api('characters/options').then(setOptions).catch(e=>setError(e.message));return()=>audio.current?.pause()},[]);

 const recipe=[accent,direction.trim(),gender,text].join('|');
 const name=(nameChoice===CUSTOM?customName:nameChoice).trim();
 const kind=options?.accents.find(a=>a.name===accent)?.kind;
 const takes=job?.takes||[];
 const ready=job?.status==='complete'&&takes[pick]?.status==='complete'&&requested.current===recipe;
 const needsDesigner=kind!=='real'||!!direction.trim();

 function play(i,url){
  audio.current?.pause();
  if(playing===i){setPlaying(null);return}
  const a=new Audio(url+'?t='+Date.now());a.onended=()=>setPlaying(null);a.play().catch(()=>setPlaying(null));
  audio.current=a;setPlaying(i);
 }
 async function makeTakes(){
  setError('');setBusy('takes');setPlaying(null);audio.current?.pause();requested.current=recipe;setPick(0);
  try{
   let j=await api('characters/takes',post({source_key:source.value,accent,direction,gender,text}));
   setJob(j);
   for(let n=0;!['complete','failed'].includes(j.status)&&n<3600;n++){await new Promise(r=>setTimeout(r,1000));j=await api('jobs/'+j.job_id);setJob(j)}
   if(j.status!=='complete')throw Error(j.message||'Could not make takes');
  }catch(e){setError(e.message)}finally{setBusy('')}
 }
 async function save(){
  setError('');setBusy('save');
  try{
   const c=await api('characters',post({source_key:source.value,name,accent,direction,gender,job_id:job.job_id,take:pick}));
   await onCreated(c);
  }catch(e){setError(e.message);setBusy('')}
 }

 const designed=options?.accents.filter(a=>a.kind==='designed')||[],real=options?.accents.filter(a=>a.kind!=='designed')||[];
 const dialogRef=useDialogFocus();
 return <div className="narrator-modal-backdrop character-backdrop" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}}} onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="narrator-modal character-voice" ref={dialogRef} role="dialog" aria-modal="true" aria-label={'New character for '+source.label}>
   <div className="narrator-modal-head"><div><h3><i className="fa-solid fa-masks-theater" aria-hidden="true"/> New character</h3><p><strong>{source.label}</strong>'s voice with an accent or a way of talking, the way a narrator does different characters.</p></div><button type="button" className="narrator-close" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark"/></button></div>
   <div className="character-body">
    {options&&!options.converter_ready&&<div className="notice">Characters need the <strong>Character voices</strong> converter (about 130 MB plus PyTorch). {onOpenModels&&<button type="button" className="link" onClick={onOpenModels}>Install it in Models</button>}</div>}
    <label>Character name <small>(just a label)</small>
     <select value={nameChoice} onChange={e=>setNameChoice(e.target.value)}>{(options?.names||['Narrator']).map(n=><option key={n}>{n}</option>)}<option value={CUSTOM}>Custom…</option></select>
    </label>
    {nameChoice===CUSTOM&&<input aria-label="Custom character name" autoFocus maxLength={80} value={customName} onChange={e=>setCustomName(e.target.value)} placeholder="e.g. Captain Mira"/>}
    <label>Accent<select value={accent} onChange={e=>setAccent(e.target.value)}>
     {real.map(a=><option key={a.name}>{a.name}</option>)}
     {designed.length>0&&<optgroup label="Approximate (voice designer)">{designed.map(a=><option key={a.name}>{a.name}</option>)}</optgroup>}
    </select></label>
    <label>How they talk <small>(optional)</small><textarea rows={2} maxLength={400} value={direction} onChange={e=>setDirection(e.target.value)} placeholder="e.g. old and slow, gravelly, whispering, excited"/></label>
    {!source.gender&&<label>The original voice is<select value={gender} onChange={e=>setGender(e.target.value)}><option value="female">Female</option><option value="male">Male</option><option value="neutral">Neither / unsure</option></select></label>}
    <p className="hint">{kind==='real'&&!direction.trim()?`A native ${accent} speaker performs the line, then it's turned into ${source.label}'s voice. This gives the most natural accent.`
     :`The voice designer performs the line from your description, then it's turned into ${source.label}'s voice.${kind==='real'?' Leave "How they talk" empty for a more natural accent.':''}`}</p>
    {needsDesigner&&options&&!options.design_ready&&<div className="notice">This needs the voice designer. Install it in Models, or pick a non-approximate accent with "How they talk" empty.</div>}
    <label>Preview line<input value={text} maxLength={300} onChange={e=>setText(e.target.value)}/></label>
    {job&&requested.current===recipe&&<div className="character-takes" role="radiogroup" aria-label="Takes">
     <small>{job.status==='complete'?'Pick the take that sounds best.':job.status==='failed'?'':job.message||'Working…'}</small>
     {takes.map((t,i)=><div key={i} className={'character-take '+(pick===i?'on':'')}>
      <label><input type="radio" name="take" checked={pick===i} disabled={t.status!=='complete'} onChange={()=>setPick(i)}/> Take {i+1}</label>
      {t.status==='complete'?<button type="button" onClick={()=>play(i,t.url)} aria-label={(playing===i?'Stop take ':'Play take ')+(i+1)}><i className={'fa-solid '+(playing===i?'fa-stop':'fa-play')} aria-hidden="true"/></button>
       :<small>{job.status==='failed'?'—':'Waiting…'}</small>}
     </div>)}
    </div>}
    {error&&<p className="character-error">{error}</p>}
   </div>
   <div className="narrator-modal-footer">
    <button type="button" onClick={onClose}>Cancel</button>
    <span className="character-actions">
     <button type="button" disabled={!options?.converter_ready||!!busy||!text.trim()} onClick={makeTakes}><i className={'fa-solid '+(busy==='takes'?'fa-spinner fa-spin':'fa-play')} aria-hidden="true"/> {busy==='takes'?'Making takes…':ready?'New takes':'Make 3 takes'}</button>
     <button type="button" className="primary" disabled={!ready||!name||!!busy} title={ready?'':'Make takes first'} onClick={save}>{busy==='save'?'Saving…':ready?`Save take ${pick+1}`:'Save'}</button>
    </span>
   </div>
  </div>
 </div>;
}
