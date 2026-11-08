import React,{useEffect,useRef,useState} from 'react';

// A character version is a new designed voice: the voice designer reads a
// written description, so it sounds like the original's kind of voice but is
// not an exact copy of it.
export const ACCENTS=['Keep the original','American','Southern American','New York','British (RP)','London Cockney','Scottish','Irish','Welsh','Australian','Canadian','Indian','South African','French','German','Italian','Spanish','Russian','Scandinavian','Japanese','Jamaican'];
export const CHARACTERS=[
 ['','Plain narrator (no character)'],
 ['a wise old wizard, slow and knowing','Wise old wizard'],
 ['a menacing villain, low and silky with quiet threat','Menacing villain'],
 ['a rowdy pirate captain, loud and gravelly','Pirate captain'],
 ['a curious, excited young child','Excited child'],
 ['a gruff, tired soldier who has seen too much','Gruff soldier'],
 ['a breathy, whispering ghost','Whispering ghost'],
 ['a cheerful, bouncy sidekick','Cheerful sidekick'],
 ['a stiff, precise robot or computer','Robot / computer'],
 ['a polished vintage radio announcer','Radio announcer'],
 ['a nervous, jittery character who stumbles over words','Nervous wreck'],
 ['a regal, commanding king or queen','Royalty'],
 ['a warm, gentle grandparent telling a bedtime story','Bedtime grandparent'],
 ['a hard-boiled noir detective','Noir detective'],
];
const SAMPLE='Gather round, and I will tell you how it all began.';

export function characterDescription({base,gender,accent,character,extra}){
 const start=base?.trim()?`Start from this voice: ${base.trim().replace(/\.$/,'')}.`:`A ${gender} speaking voice.`;
 return [start,
  accent&&accent!==ACCENTS[0]?`Speak with a natural, consistent ${accent} accent.`:'',
  character?`Perform it the way an audiobook narrator voices ${character}, staying in character the whole time.`:'',
  extra?.trim()].filter(Boolean).join(' ').slice(0,1100);
}

export default function CharacterVoice({api,source,designReady,onClose,onCreated}){
 const [accent,setAccent]=useState(ACCENTS[0]),[character,setCharacter]=useState(CHARACTERS[1][0]),[extra,setExtra]=useState('');
 const [gender,setGender]=useState(source.gender||'female'),[name,setName]=useState(''),[nameEdited,setNameEdited]=useState(false);
 const [text,setText]=useState(SAMPLE),[job,setJob]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const audio=useRef(null),requested=useRef('');
 const description=characterDescription({base:source.baseDescription,gender,accent,character,extra});
 const label=CHARACTERS.find(c=>c[0]===character)?.[1];
 useEffect(()=>{if(!nameEdited)setName([source.label,accent!==ACCENTS[0]?accent.replace(/ \(.*\)$/,''):'',character?label:''].filter(Boolean).join(' · '))},[accent,character]);
 useEffect(()=>()=>audio.current?.pause(),[]);

 async function preview(){
  setError('');setBusy('preview');requested.current=description+'|'+text;audio.current?.pause();
  try{
   let j=await api('designed-voices/draft-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,description,characteristics:{pitch:50,rasp:50,pace:50,warmth:50}})});
   for(let i=0;!['complete','failed'].includes(j.status)&&i<1200;i++){setJob(j);await new Promise(r=>setTimeout(r,1000));j=await api('jobs/'+j.job_id)}
   setJob(j);
   if(j.status!=='complete')throw Error(j.message||'Preview failed');
   audio.current=new Audio(j.download_url);audio.current.play().catch(()=>{});
  }catch(e){setError(e.message)}finally{setBusy('')}
 }
 async function save(){
  setError('');setBusy('save');
  try{
   const d=await api('designed-voices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.trim()||source.label+' character',category:'Character voices',description,characteristics:{pitch:50,rasp:50,pace:50,warmth:50},method:'prompt'})});
   // The approved preview becomes the voice's reference, so narration sounds like what you heard.
   await api(`designed-voices/${d.id}/versions/${d.active_version}/attach-preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({job_id:job.job_id,approve:true})});
   await onCreated('design:'+d.id);
  }catch(e){setError(e.message);setBusy('')}
 }
 const ready=job?.status==='complete'&&requested.current===description+'|'+text;
 return <div className="narrator-modal-backdrop character-backdrop" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}}} onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="narrator-modal character-voice" role="dialog" aria-modal="true" aria-label={'Make a character version of '+source.label}>
   <div className="narrator-modal-head"><div><h3><i className="fa-solid fa-masks-theater" aria-hidden="true"/> Character version</h3><p>Based on <strong>{source.label}</strong>. Give it an accent or have it play a character, the way narrators do different voices.</p></div><button type="button" className="narrator-close" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark"/></button></div>
   <div className="character-body">
    {!designReady&&<div className="notice">Character voices use the voice designer. Install it in Models first.</div>}
    {!source.baseDescription&&<label>This voice sounds<select value={gender} onChange={e=>setGender(e.target.value)}><option value="female">Female</option><option value="male">Male</option><option value="gender-neutral">Gender-neutral</option></select></label>}
    <label>Accent<select value={accent} onChange={e=>setAccent(e.target.value)}>{ACCENTS.map(a=><option key={a}>{a}</option>)}</select></label>
    <label>Character<select value={character} onChange={e=>setCharacter(e.target.value)}>{CHARACTERS.map(([v,l])=><option key={l} value={v}>{l}</option>)}</select></label>
    <label>Extra direction <small>(optional)</small><textarea rows={2} maxLength={400} value={extra} onChange={e=>setExtra(e.target.value)} placeholder="e.g. a little out of breath, speaks with a smile"/></label>
    <label>Preview line<input value={text} maxLength={300} onChange={e=>setText(e.target.value)}/></label>
    <label>Name<input value={name} maxLength={120} onChange={e=>{setName(e.target.value);setNameEdited(true)}}/></label>
    <p className="hint">This designs a new voice from a description of the original, so it won't be an exact copy. It's saved in Voices under "Character voices."</p>
    {busy==='preview'&&<p className="hint">{job?.message||'Starting the voice designer…'}</p>}
    {error&&<p className="character-error">{error}</p>}
   </div>
   <div className="narrator-modal-footer">
    <button type="button" onClick={onClose}>Cancel</button>
    <span className="character-actions">
     <button type="button" disabled={!designReady||!!busy||!text.trim()} onClick={preview}><i className={'fa-solid '+(busy==='preview'?'fa-spinner fa-spin':'fa-play')} aria-hidden="true"/> {ready?'Try again':'Preview'}</button>
     {ready&&<button type="button" onClick={()=>{audio.current?.pause();audio.current=new Audio(job.download_url);audio.current.play().catch(()=>{})}} aria-label="Replay preview"><i className="fa-solid fa-rotate-left" aria-hidden="true"/></button>}
     <button type="button" className="primary" disabled={!ready||!!busy} title={ready?'':'Preview it first'} onClick={save}>{busy==='save'?'Saving…':'Save & use'}</button>
    </span>
   </div>
  </div>
 </div>;
}
