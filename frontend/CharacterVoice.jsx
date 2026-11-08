import React,{useEffect,useRef,useState} from 'react';

// A character version is a new designed voice: the voice designer reads a
// written description, so it sounds like the original's kind of voice but is
// not an exact copy of it.
// Each accent is written as a person from a place, with the sounds that mark it:
// the voice designer follows a concrete speaker much better than "use X accent".
export const ACCENTS=[
 ['Keep the original',''],
 ['American','from the American Midwest, with a clear General American accent and rhotic r sounds'],
 ['Southern American','from rural Georgia, with a strong Southern drawl: stretched, gliding vowels and an easy, unhurried rhythm'],
 ['New York','from Brooklyn, New York, with a thick New York accent: dropped r sounds, "cawfee" vowels, fast and punchy'],
 ['British (RP)','from southern England, with a crisp, upper-class British Received Pronunciation accent: non-rhotic, long "ah" vowels'],
 ['London Cockney','from the East End of London, with a broad Cockney accent: dropped h sounds, glottal stops instead of t, "fing" for "thing"'],
 ['Scottish','from Glasgow, Scotland, with a thick, broad Scottish accent: strongly rolled r sounds, short clipped vowels, "wee" and "aye" sounds'],
 ['Irish','from County Cork, Ireland, with a strong lilting Irish brogue: soft t sounds, musical rising intonation'],
 ['Welsh','from the Welsh valleys, with a strong sing-song Welsh accent and rising, musical intonation'],
 ['Australian','from Queensland, Australia, with a broad Australian accent: wide "eye" vowels, rising endings, relaxed and drawling'],
 ['Canadian','from Ontario, Canada, with a Canadian accent: raised "ou" in "about", "eh" cadence'],
 ['Indian','from Mumbai, India, with a strong Indian English accent: retroflex t and d, syllable-timed rhythm'],
 ['South African','from Johannesburg, South Africa, with a strong Afrikaans-influenced South African accent: clipped vowels, slightly rolled r'],
 ['French','from Paris, France, speaking English with a heavy French accent: no h sounds, "z" for "th", stress on the last syllable'],
 ['German','from Berlin, Germany, speaking English with a heavy German accent: "v" for "w", "z" for "th", hard consonants'],
 ['Italian','from Naples, Italy, speaking English with a heavy Italian accent: extra vowels on word endings, expressive, melodic'],
 ['Spanish','from Madrid, Spain, speaking English with a heavy Spanish accent: "e" before s-words, rolled r, short pure vowels'],
 ['Russian','from Moscow, Russia, speaking English with a heavy Russian accent: rolled r, hard consonants, no articles, flat intonation'],
 ['Scandinavian','from Stockholm, Sweden, speaking English with a strong Swedish accent: sing-song pitch, "y" for "j"'],
 ['Japanese','from Tokyo, Japan, speaking English with a strong Japanese accent: l and r merged, vowels added after consonants'],
 ['Jamaican','from Kingston, Jamaica, with a strong Jamaican Patois-influenced accent: "dis" and "dat" for "this" and "that", rhythmic and musical'],
];
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

// Built-in voice descriptions only restate their region ("A male British English
// voice"), which fights a new accent, so only designed voices keep their wording.
export function characterDescription({base,gender,accent,character,extra}){
 const person={female:'A woman',male:'A man'}[gender]||'A person';
 const place=ACCENTS.find(a=>a[0]===accent)?.[1];
 return [place?`${person} ${place}.`:`${person} speaking in their natural accent.`,
  place?`The ${accent} accent is strong and clearly audible on every single word; never slip into a neutral or different accent.`:'',
  character?`They are performing ${character}, the way an audiobook narrator voices a character, staying fully in character.`:'',
  base?.trim()?`Voice quality to keep: ${base.trim().replace(/\.$/,'')}${place?' (ignore any accent mentioned here)':''}.`:'',
  extra?.trim()].filter(Boolean).join(' ').slice(0,1100);
}

const TAKES=3;

export default function CharacterVoice({api,source,designReady,onClose,onCreated}){
 const [accent,setAccent]=useState(ACCENTS[0][0]),[character,setCharacter]=useState(CHARACTERS[1][0]),[extra,setExtra]=useState('');
 const [gender,setGender]=useState(source.gender||'female'),[name,setName]=useState(''),[nameEdited,setNameEdited]=useState(false);
 const [text,setText]=useState(SAMPLE),[takes,setTakes]=useState([]),[pick,setPick]=useState(0),[playingTake,setPlayingTake]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const audio=useRef(null),requested=useRef('');
 const description=characterDescription({base:source.kind==='builtin'?'':source.baseDescription,gender,accent,character,extra});
 const label=CHARACTERS.find(c=>c[0]===character)?.[1];
 useEffect(()=>{if(!nameEdited)setName([source.label,accent!==ACCENTS[0][0]?accent.replace(/ \(.*\)$/,''):'',character?label:''].filter(Boolean).join(' · '))},[accent,character]);
 useEffect(()=>()=>audio.current?.pause(),[]);

 function play(i,url){
  audio.current?.pause();
  if(playingTake===i){setPlayingTake(null);return}
  const a=new Audio(url);a.onended=()=>setPlayingTake(null);a.play().catch(()=>setPlayingTake(null));
  audio.current=a;setPlayingTake(i);
 }
 // Several takes of the same description: accents land differently each time, so you pick the best one.
 async function preview(){
  setError('');setBusy('preview');requested.current=description+'|'+text;audio.current?.pause();setPlayingTake(null);setPick(0);
  try{
   const body=JSON.stringify({text,description,characteristics:{pitch:50,rasp:50,pace:50,warmth:50}});
   let jobs=[];
   for(let i=0;i<TAKES;i++)jobs.push(await api('designed-voices/draft-preview',{method:'POST',headers:{'Content-Type':'application/json'},body}));
   setTakes(jobs);
   for(let n=0;jobs.some(j=>!['complete','failed'].includes(j.status))&&n<2400;n++){
    await new Promise(r=>setTimeout(r,1000));
    jobs=await Promise.all(jobs.map(j=>['complete','failed'].includes(j.status)?j:api('jobs/'+j.job_id)));
    setTakes(jobs);
   }
   const done=jobs.findIndex(j=>j.status==='complete');
   if(done<0)throw Error(jobs[0]?.message||'Preview failed');
   setPick(done);
  }catch(e){setError(e.message)}finally{setBusy('')}
 }
 async function save(){
  setError('');setBusy('save');
  try{
   const d=await api('designed-voices',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.trim()||source.label+' character',category:'Character voices',description,characteristics:{pitch:50,rasp:50,pace:50,warmth:50},method:'prompt'})});
   // The approved preview becomes the voice's reference, so narration sounds like what you heard.
   await api(`designed-voices/${d.id}/versions/${d.active_version}/attach-preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({job_id:takes[pick].job_id,approve:true})});
   await onCreated('design:'+d.id);
  }catch(e){setError(e.message);setBusy('')}
 }
 const ready=takes[pick]?.status==='complete'&&requested.current===description+'|'+text&&busy!=='preview';
 return <div className="narrator-modal-backdrop character-backdrop" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose()}}} onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="narrator-modal character-voice" role="dialog" aria-modal="true" aria-label={'Make a character version of '+source.label}>
   <div className="narrator-modal-head"><div><h3><i className="fa-solid fa-masks-theater" aria-hidden="true"/> Character version</h3><p>Based on <strong>{source.label}</strong>. Give it an accent or have it play a character, the way narrators do different voices.</p></div><button type="button" className="narrator-close" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark"/></button></div>
   <div className="character-body">
    {!designReady&&<div className="notice">Character voices use the voice designer. Install it in Models first.</div>}
    {!source.gender&&<label>This voice sounds<select value={gender} onChange={e=>setGender(e.target.value)}><option value="female">Female</option><option value="male">Male</option><option value="gender-neutral">Gender-neutral</option></select></label>}
    <label>Accent<select value={accent} onChange={e=>setAccent(e.target.value)}>{ACCENTS.map(([a])=><option key={a}>{a}</option>)}</select></label>
    <label>Character<select value={character} onChange={e=>setCharacter(e.target.value)}>{CHARACTERS.map(([v,l])=><option key={l} value={v}>{l}</option>)}</select></label>
    <label>Extra direction <small>(optional)</small><textarea rows={2} maxLength={400} value={extra} onChange={e=>setExtra(e.target.value)} placeholder="e.g. a little out of breath, speaks with a smile"/></label>
    <label>Preview line<input value={text} maxLength={300} onChange={e=>setText(e.target.value)}/></label>
    <label>Name<input value={name} maxLength={120} onChange={e=>{setName(e.target.value);setNameEdited(true)}}/></label>
    <p className="hint">This designs a new voice from a description of the original, so it won't be an exact copy. It's saved in Voices under "Character voices."</p>
    {takes.length>0&&requested.current===description+'|'+text&&<div className="character-takes" role="radiogroup" aria-label="Takes">
     <small>Each take sounds a little different. Pick the one where the accent comes through best.</small>
     {takes.map((t,i)=><div key={t.job_id||i} className={'character-take '+(pick===i?'on':'')}>
      <label><input type="radio" name="take" checked={pick===i} disabled={t.status!=='complete'} onChange={()=>setPick(i)}/> Take {i+1}</label>
      {t.status==='complete'?<button type="button" onClick={()=>play(i,t.download_url)} aria-label={(playingTake===i?'Stop take ':'Play take ')+(i+1)}><i className={'fa-solid '+(playingTake===i?'fa-stop':'fa-play')} aria-hidden="true"/></button>
       :<small>{t.status==='failed'?(t.message||'Failed'):t.status==='running'?(t.message||'Generating…'):'Waiting…'}</small>}
     </div>)}
    </div>}
    {error&&<p className="character-error">{error}</p>}
   </div>
   <div className="narrator-modal-footer">
    <button type="button" onClick={onClose}>Cancel</button>
    <span className="character-actions">
     <button type="button" disabled={!designReady||!!busy||!text.trim()} onClick={preview}><i className={'fa-solid '+(busy==='preview'?'fa-spinner fa-spin':'fa-play')} aria-hidden="true"/> {busy==='preview'?'Generating…':ready?'New takes':'Preview '+TAKES+' takes'}</button>
     <button type="button" className="primary" disabled={!ready||!!busy} title={ready?'Save take '+(pick+1):'Preview it first'} onClick={save}>{busy==='save'?'Saving…':ready?'Save take '+(pick+1)+' & use':'Save & use'}</button>
    </span>
   </div>
  </div>
 </div>;
}
