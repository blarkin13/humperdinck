import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '@fontsource/dm-serif-display/400.css';
import '@fontsource/josefin-sans/400.css';
import '@fontsource/josefin-sans/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import './style.css';
import DropZone from './DropZone.jsx';
import AudioEditor from './AudioEditor.jsx';
import VoiceGrid,{ago} from './VoiceGrid.jsx';
import Updates from './Updates.jsx';
import Recorder from './Recorder.jsx';
import Models from './Models.jsx';
// An audio player that says so (with a download link) when the browser cannot play the clip.
function Player({src}){const [failed,setFailed]=useState(false);
 return failed?<p className="notice"><i className="fa-solid fa-triangle-exclamation"/> This browser could not play the clip. <a href={src} download>Download it</a> to listen.</p>
  :<audio controls preload="metadata" src={src} onError={()=>setFailed(true)}/>}

// A one-line description of a voice's strongest traits for its card, falling back to the written description.
function voiceSummary(v){
 const words=Object.entries(v.characteristics||{}).filter(([k,n])=>traitLabels[k]&&(n<35||n>65)).sort((a,b)=>Math.abs(b[1]-50)-Math.abs(a[1]-50))
  .map(([k,n])=>(n<20||n>80?'very ':'')+traitLabels[k][n<35?1:2].toLowerCase()+(['pitch','pace'].includes(k)?' '+k:''));
 const text=words.length?words.slice(0,5).join(', '):'';
 return text?text[0].toUpperCase()+text.slice(1)+'.':(v.description||'').replace(/\s+/g,' ').trim();
}
const defaults={pitch:50,rasp:50,pace:50,warmth:50,age:50,breathiness:50,depth:50,energy:50,clarity:50,expressiveness:50};
// Slider labels: [name, low end, high end]
const traitLabels={pitch:['Pitch','Low','High'],rasp:['Rasp','Smooth','Gravelly'],pace:['Pace','Slow','Fast'],warmth:['Warmth','Cool','Warm'],age:['Age','Young','Mature'],breathiness:['Breathiness','Firm','Breathy'],depth:['Depth','Light','Deep'],energy:['Energy','Calm','Energetic'],clarity:['Articulation','Casual','Crisp'],expressiveness:['Expressiveness','Flat','Lively']};
// Accent first and in detail: a bare "Irish accent" at the end of the prompt was followed only loosely.
const accentPrompts={American:'a General American accent, as heard in US national broadcasting',British:'a Southern English (Received Pronunciation) British accent, with non-rhotic r sounds and crisp consonants',Australian:'a broad Australian accent, with Australian vowel sounds and rising intonation',Irish:'a natural Irish accent from Dublin, with a soft lilt, Irish vowel sounds and rolled r sounds',Scottish:'a Scottish accent from Glasgow, with rolled r sounds and clipped Scottish vowels',['Southern US']:'a Southern American drawl from Georgia, with stretched vowels and a relaxed rhythm',Canadian:'a Canadian English accent, with Canadian vowel raising',Indian:'an Indian English accent, with syllable-timed rhythm and Indian English intonation',['South African']:'a South African English accent, with clipped vowels and South African intonation',['New Zealand']:'a New Zealand accent, with Kiwi vowel sounds such as centralized short i'};
const accents=['',...Object.keys(accentPrompts)];
const styles=['','Audiobook narrator','Documentary','Conversational','News anchor','Storyteller','Commercial','Character / animated','Meditation / calm','Trailer / dramatic'];
const sameTraits=(a,b)=>Object.keys(defaults).every(k=>(a?.[k]??50)===(b?.[k]??50));
const starter='Good evening. I have been waiting a long time to tell you this story.';
// An empty or non-JSON reply means the backend is not running (it crashed or is still starting).
async function api(path,options){const r=await fetch('/api/'+path,options);let j;try{j=await r.json()}catch{throw Error('Humperdinck\'s backend is not responding. Check the start.cmd / start.sh window for an error, then restart it.')}if(!r.ok)throw Error(typeof j.detail==='string'?j.detail:JSON.stringify(j.detail||j));return j}
const json=(method,body)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function App(){
 const [tab,setTab]=useState('voices'),[method,setMethod]=useState('controls'),[designed,setDesigned]=useState([]),[uploads,setUploads]=useState([]),[selected,setSelected]=useState(''),[detail,setDetail]=useState(null);
 const [name,setName]=useState('New voice'),[gender,setGender]=useState('masculine'),[description,setDescription]=useState(''),[settings,setSettings]=useState({...defaults}),[previewText,setPreviewText]=useState(starter),[candidates,setCandidates]=useState([]),[chosen,setChosen]=useState(''),[previewJob,setPreviewJob]=useState(null),[status,setStatus]=useState('');
 const [blocks,setBlocks]=useState([{id:1,text:'',voice_key:''}]),[format,setFormat]=useState('mp3'),[narrationJob,setNarrationJob]=useState(null),[video,setVideo]=useState(null),[videoJob,setVideoJob]=useState(null),[offset,setOffset]=useState(0),[mix,setMix]=useState(false);
 const [savedReference,setSavedReference]=useState(false),[category,setCategory]=useState(''),[accent,setAccent]=useState(''),[style,setStyle]=useState(''),[uploadSel,setUploadSel]=useState(''),[savedJobs,setSavedJobs]=useState([]);
 async function refresh(){try{const [d,u]=await Promise.all([api('designed-voices'),api('voices')]);setDesigned(d);setUploads(u)}catch(e){setStatus(e.message)}}
 useEffect(()=>{refresh()},[]);
 useEffect(()=>{if(!previewJob||!['queued','running'].includes(previewJob.status))return;const timer=setInterval(async()=>{try{const j=await api('jobs/'+previewJob.job_id);setPreviewJob({...j,design_instruction:previewJob.design_instruction,design_model:previewJob.design_model});if(j.status==='complete'){setCandidates(old=>old.some(c=>c.job_id===j.job_id)?old:[...old,{...j,recipe:previewJob.recipe,design_instruction:previewJob.design_instruction,design_model:previewJob.design_model}]);setChosen(j.job_id);setStatus('Preview ready. Listen and select your favorite.')}else if(j.status==='failed')setStatus(j.message)}catch(e){setStatus(e.message)}},1000);return()=>clearInterval(timer)},[previewJob?.job_id,previewJob?.status]);
 useEffect(()=>{if(!narrationJob||!['queued','running'].includes(narrationJob.status))return;const timer=setInterval(async()=>{try{const j=await api('jobs/'+narrationJob.job_id);setNarrationJob(j);if(j.status==='failed')setStatus(j.message)}catch(e){setStatus(e.message)}},1000);return()=>clearInterval(timer)},[narrationJob?.job_id,narrationJob?.status]);
 useEffect(()=>{if(!videoJob||!['queued','running'].includes(videoJob.status))return;const timer=setInterval(async()=>{try{const j=await api('jobs/'+videoJob.job_id);setVideoJob(j);if(j.status==='failed')setStatus(j.message)}catch(e){setStatus(e.message)}},1000);return()=>clearInterval(timer)},[videoJob?.job_id,videoJob?.status]);
 function recipe(){return JSON.stringify({gender,description,settings,method,accent,style})}
  function voicePrompt(){
    const base=description.trim();
    if(method==='prompt')return base;
    const lead=accent?`Speak consistently with ${accentPrompts[accent]}. Preserve the accent throughout the recording. `:'';
    return `${lead}A ${gender}-presenting adult voice${style?` in a ${style.toLowerCase()} style`:''}. ${base}`.trim();
  }
 function newVoice(){setSelected('');setUploadSel('');setDetail(null);setName('New voice');setDescription('');setGender('masculine');setSettings({...defaults});setAccent('');setStyle('');setCategory('');setCandidates([]);setChosen('');setSavedJobs([]);setSavedReference(false)}
 async function openVoice(id){try{const d=await api('designed-voices/'+id);const v=d.versions.find(v=>v.version===d.active_version);setSelected(id);setUploadSel('');setDetail(d);setName(d.name);setCategory(d.category||'');setDescription(v.description);setSettings({...defaults,...v.characteristics});setMethod('prompt');setCandidates([]);setChosen('');setSavedReference(!!v.approved_sample_id);setStatus('')}catch(e){setStatus(e.message)}}
 async function upload(file,type){if(!file)return;const form=new FormData();form.append('file',file);try{setStatus('Uploading...');const result=await api(type,{method:'POST',body:form});if(type==='voices'){await refresh();setStatus('Voice imported. It is available for narration.')}else{setVideo(result);setStatus('Video uploaded. Generate narration and position it on the timeline.')}return result}catch(e){setStatus(e.message)}}
 async function preview(){try{const prompt=voicePrompt();if(!prompt)throw Error('Describe the voice first');const key=recipe();const j=await api('designed-voices/draft-preview',json('POST',{text:previewText,description:prompt,characteristics:settings}));setPreviewJob({...j,recipe:key});setStatus('Generating preview...')}catch(e){setStatus(e.message)}}
 async function saveVoice(approve){
  try{
   const prompt=voicePrompt();
   if(!prompt.trim())throw Error('Describe the voice first');
   // Validate the selected audio before writing any database changes.
   const candidate=approve?candidates.find(c=>c.job_id===chosen&&c.recipe===recipe()):null;
   if(approve&&!candidate)throw Error('Generate and select a preview for these settings first');
   const isExisting=!!selected;
   const current=detail?.versions?.find(v=>v.version===detail.active_version);
   const changed=!isExisting||!current||current.description!==prompt||!sameTraits(current.characteristics,settings);
   let d;
   if(!isExisting){
    d=await api('designed-voices',json('POST',{name,category,description:prompt,characteristics:settings,method:method==='controls'?'sliders':'prompt'}));
   }else if(changed){
    d=await api('designed-voices/'+selected+'/versions',json('POST',{description:prompt,characteristics:settings}));
   }else{
    d=detail;
   }
   if(isExisting&&(name!==d.name||category!==(d.category||'')))d=await api('designed-voices/'+selected,json('PATCH',{name,category}));
   if(approve){
    await api(`designed-voices/${d.id}/versions/${d.active_version}/attach-preview`,json('POST',{job_id:candidate.job_id,approve:true}));
   }
   // A brand-new voice keeps the designer open so more voices can be saved from the same session.
   if(!isExisting&&approve){setSavedJobs(old=>[...old,candidate.job_id]);await refresh();setStatus(`Saved "${name}". Pick another candidate or adjust the sliders to save more voices.`);setName(nextName(name));return}
   await refresh();await openVoice(d.id);
   setStatus(approve?'Voice approved and available for narration.':changed?'Draft saved. Previously approved recordings remain available for narration.':'Voice already saved. No new version was created.');
  }catch(e){setStatus('Save failed: '+e.message)}
 }
 function nextName(n){const m=n.match(/^(.*?)(\d+)$/);return m?m[1]+(+m[2]+1):n+' 2'}
 async function saveCandidateAsNew(c){
  const voiceName=window.prompt('Name for the new voice',name);if(!voiceName)return;
  try{const d=await api('designed-voices',json('POST',{name:voiceName.trim(),category,description:voicePrompt(),characteristics:settings,method:method==='controls'?'sliders':'prompt'}));
   await api(`designed-voices/${d.id}/versions/1/attach-preview`,json('POST',{job_id:c.job_id,approve:true}));
   setSavedJobs(old=>[...old,c.job_id]);await refresh();setStatus(`Saved "${voiceName}" as a new voice.`)}catch(e){setStatus('Save failed: '+e.message)}}
 async function deleteVersion(version){
  if(!confirm(`Delete version ${version} and its samples?`))return;
  try{await api(`designed-voices/${selected}/versions/${version}`,{method:'DELETE'});await refresh();await openVoice(selected);setStatus(`Version ${version} deleted.`)}catch(e){setStatus(e.message)}}
 async function deleteDesigned(id,voiceName){if(!confirm(`Delete "${voiceName}" and all its versions?`))return;try{await api('designed-voices/'+id,{method:'DELETE'});if(selected===id)newVoice();await refresh()}catch(e){setStatus(e.message)}}
 async function deleteUpload(id,voiceName){if(!confirm(`Delete uploaded voice "${voiceName}"?`))return;try{await api('voices/'+id,{method:'DELETE'});if(uploadSel===id)newVoice();setBlocks(old=>old.map(b=>b.voice_key==='upload:'+id?{...b,voice_key:''}:b));await refresh()}catch(e){setStatus(e.message)}}
 async function updateUpload(id,changes){try{await api('voices/'+id,json('PATCH',changes));await refresh()}catch(e){setStatus(e.message)}}
 function openUpload(id){newVoice();setUploadSel(id);setMethod('upload')}
 async function restoreVersion(version){
  try{await api(`designed-voices/${selected}/versions/${version}/activate`,{method:'POST'});await refresh();await openVoice(selected);setStatus('Version '+version+' restored as current.');}
  catch(e){setStatus(e.message)}
 }

 async function deleteVoice(){if(!selected||!confirm('Delete this voice?'))return;try{await api('designed-voices/'+selected,{method:'DELETE'});newVoice();await refresh()}catch(e){setStatus(e.message)}}
 async function approveExisting(sample,version){try{await api(`designed-voices/${selected}/versions/${version}/approve/${sample}`,{method:'POST'});await openVoice(selected);setStatus('Reference approved.')}catch(e){setStatus(e.message)}}
 const voiceOptions=[...designed.filter(v=>v.narration_sample_id).map(v=>({value:'design:'+v.id,label:v.name+' · designed (v'+v.narration_version+')'})),...uploads.map(v=>({value:'upload:'+v.voice_id,label:v.filename+' · uploaded'}))];
 const busy=job=>['queued','running'].includes(job?.status);
 function changeBlock(id,field,value){setBlocks(old=>old.map(b=>b.id===id?{...b,[field]:value}:b))}
 async function generateNarration(){try{if(blocks.some(b=>!b.text.trim()||!b.voice_key))throw Error('Every block needs text and an approved voice');const j=await api('narrations',json('POST',{blocks:blocks.map(b=>({text:b.text,voice_key:b.voice_key})),format}));setNarrationJob(j);setStatus('Generating narration...')}catch(e){setStatus(e.message)}}
 async function renderVideo(){try{if(!video||narrationJob?.status!=='complete')throw Error('Upload a video and generate narration first');const j=await api('video-renders',json('POST',{video_id:video.video_id,narration_job_id:narrationJob.job_id,start_seconds:Number(offset),keep_original_audio:mix}));setVideoJob(j);setStatus('Rendering video...')}catch(e){setStatus(e.message)}}
 return <main><header><div className="brand"><img src="/brand-mark.png" alt="" className="brand-mark"/><div><h1>Humperdinck</h1><small>A modern vintage recording studio</small></div></div><div className="header-actions"><Updates/><span className="local"><i className="fa-solid fa-circle"/> On air · local</span></div></header>
 <nav>{[['voices','Voice Library','fa-record-vinyl'],['narration','Narration Studio','fa-sliders'],['video','Video Studio','fa-film'],['models','Models','fa-microchip']].map(([id,label,icon])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><i className={'fa-solid '+icon}/> {label}</button>)}</nav>
 {tab==='voices'&&<section><div className="heading"><div><h2>Voice Library</h2><p>Create a voice once, then use it in any narration.</p></div><button className="primary" onClick={newVoice}><i className="fa-solid fa-plus"/> New voice</button></div>
 <VoiceGrid items={[...designed.map(v=>({key:'d'+v.id,method:v.method||'designed',name:v.name,category:v.category,selected:selected===v.id,ready:!!v.narration_sample_id,
  status:v.narration_sample_id?'Ready · v'+v.narration_version+' approved':'Draft · v'+v.active_version,summary:voiceSummary(v),
  meters:['pitch','rasp','pace','warmth'].map(k=>[traitLabels[k][0],v.characteristics?.[k]??50,traitLabels[k][1],traitLabels[k][2]]),
  specs:[['fa-solid fa-code-branch',v.version_count,'Versions'],['fa-solid fa-compact-disc',v.sample_count,'Preview takes'],['fa-regular fa-calendar',ago(v.updated_at),'Last changed']],
  previewUrl:v.preview_sample_id&&'/api/designed-samples/'+v.preview_sample_id,onOpen:()=>openVoice(v.id),onDelete:()=>deleteDesigned(v.id,v.name)})),
  ...uploads.map(v=>({key:'u'+v.voice_id,method:v.origin||'uploaded',name:v.filename,category:v.category,selected:uploadSel===v.voice_id,ready:true,status:'Ready for narration',
  summary:`${v.duration?v.duration+'-second ':''}${v.channels===2?'stereo':'mono'} reference clip used to clone this voice.${v.duration&&v.duration<10?' Longer clips (10–30 s) clone more reliably.':''}`,
  traits:[v.sample_rate&&(v.sample_rate/1000).toFixed(1)+' kHz',v.size_kb&&Math.round(v.size_kb/102.4)/10+' MB'].filter(Boolean),
  specs:[v.duration&&['fa-regular fa-clock',v.duration+'s','Length'],['fa-regular fa-calendar',ago(v.added_at),'Added']],
  previewUrl:'/api/voices/'+v.voice_id+'/audio',onOpen:()=>openUpload(v.voice_id),onDelete:()=>deleteUpload(v.voice_id,v.filename)}))]}/>
 <datalist id="categories">{[...new Set([...designed,...uploads].map(v=>v.category).filter(Boolean))].map(c=><option key={c} value={c}/>)}</datalist>
 <h3>Create a voice</h3><div className="method-grid">{[['upload','Upload Audio','Clone from a recording','fa-file-audio'],['record','Record with Mic','Record your own voice','fa-microphone'],['controls','Design with Sliders','Choose vocal characteristics','fa-sliders'],['prompt','Describe a Voice','Write what you want to hear','fa-feather-pointed']].map(([id,title,subtitle,icon])=><button className={'method '+(method===id?'active':'')} key={id} onClick={()=>{setMethod(id);setCandidates([]);setChosen('')}}><i className={'fa-solid method-icon '+icon}/><strong>{title}</strong><small>{subtitle}</small></button>)}</div>
 {method==='record'?<div className="panel"><h3>Record with your microphone</h3><Recorder onSave={async f=>{const r=await upload(f,'voices');if(r){openUpload(r.voice_id);setStatus('Recording saved and ready for narration. Trim or clean it up below if needed.')}}}/></div>:method==='upload'?<div className="panel"><h3>Upload a voice reference</h3><DropZone accept=".wav,.mp3,.flac,.m4a" onFile={f=>upload(f,'voices')} title="Drop a voice recording" hint="A clear recording you own or have permission to clone. WAV, MP3, FLAC or M4A, up to 30 MB. 10–30 seconds of clean speech works best."/>
  {(()=>{const u=uploads.find(v=>v.voice_id===uploadSel);if(!u)return null;return <div className="saved"><h3>{u.filename}</h3><div className="field-row"><div className="field"><label>Name</label><input defaultValue={u.filename} key={'n'+u.voice_id} onBlur={e=>e.target.value.trim()&&e.target.value!==u.filename&&updateUpload(u.voice_id,{name:e.target.value.trim()})}/></div><div className="field"><label>Category</label><input list="categories" defaultValue={u.category} key={'c'+u.voice_id} placeholder="e.g. Narrators" onBlur={e=>e.target.value!==u.category&&updateUpload(u.voice_id,{category:e.target.value})}/></div></div>
   <p className="hint">Trim to the cleanest speech and remove noise for a better clone.</p><AudioEditor src={'/api/voices/'+u.voice_id+'/audio'} source={'upload:'+u.voice_id} allowReplace saveLabel="Save as new voice" onSaved={async j=>{await refresh();if(j.voice_id!==u.voice_id)setUploadSel(j.voice_id);setStatus('Edited voice saved.')}}/></div>})()}</div>:<div className="panel"><div className="field-row"><div className="field"><label>Voice name</label><input value={name} onChange={e=>setName(e.target.value)}/></div><div className="field"><label>Category</label><input list="categories" value={category} onChange={e=>setCategory(e.target.value)} placeholder="e.g. Narrators, Villains"/></div></div>{method==='controls'&&<><label>Voice presentation</label><div className="toggle">{[['masculine','Male'],['feminine','Female']].map(([id,label])=><button key={id} className={gender===id?'active':''} onClick={()=>setGender(id)}>{label}</button>)}</div><div className="field-row"><div className="field"><label>Accent</label><select value={accent} onChange={e=>setAccent(e.target.value)}>{accents.map(a=><option key={a} value={a}>{a||'No preference'}</option>)}</select></div><div className="field"><label>Style</label><select value={style} onChange={e=>setStyle(e.target.value)}>{styles.map(a=><option key={a} value={a}>{a||'No preference'}</option>)}</select></div></div>
  <div className="slider-grid">{Object.keys(defaults).map(k=><div key={k}><label>{traitLabels[k][0]} <span>{settings[k]}</span></label><input type="range" min="0" max="100" value={settings[k]} onChange={e=>setSettings({...settings,[k]:+e.target.value})}/><div className="range-ends"><small>{traitLabels[k][1]}</small><small>{traitLabels[k][2]}</small></div></div>)}</div><div className="actions tight"><button onClick={()=>setSettings({...defaults})}>Reset sliders</button><button onClick={()=>setSettings(Object.fromEntries(Object.keys(defaults).map(k=>[k,Math.round(15+Math.random()*70)])))}>Randomize</button></div><p className="hint">Sliders add detailed instructions to the voice prompt, but the AI may not follow every trait. They are not precise acoustic controls.</p></>}
 <label>{method==='prompt'?'Describe the voice':'Additional voice details (optional)'}</label><textarea className="short" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Example: A relaxed, gravelly American narrator with a dry sense of humor."/>
 <div className="divider"/><h3>Preview before saving</h3><details className="panel"><summary>Inspect the exact voice instruction sent to Qwen</summary><p className="hint">The app combines your description and slider settings into this instruction. Text instructions guide the model but cannot force a particular voice.</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{previewJob?.design_instruction||voicePrompt()}</pre>{previewJob?.design_model&&<small>Preview model: {previewJob.design_model}</small>}</details><label>Sample text</label><textarea className="short" value={previewText} onChange={e=>setPreviewText(e.target.value)} maxLength={600}/><div className="actions"><button className="primary" disabled={busy(previewJob)||!previewText.trim()||!voicePrompt()} onClick={preview}>{busy(previewJob)?'Generating...':'Generate Preview'}</button><button onClick={()=>saveVoice(false)} disabled={!voicePrompt()}>Save Draft</button></div>{busy(previewJob)&&<div className="job">{previewJob.message}<progress max="100" value={previewJob.progress}/></div>}
 {candidates.filter(c=>c.recipe===recipe()).map((c,i)=><div className={'candidate '+(chosen===c.job_id?'chosen':'')} key={c.job_id}><label><input type="radio" checked={chosen===c.job_id} onChange={()=>setChosen(c.job_id)}/> Candidate {i+1}</label><Player src={c.download_url}/>{!selected&&(savedJobs.includes(c.job_id)?<small>Saved as a voice ✓</small>:<button onClick={()=>saveCandidateAsNew(c)}>Save as new voice</button>)}</div>)}
 {candidates.some(c=>c.recipe===recipe())&&<button className="primary" disabled={busy(previewJob)||savedJobs.includes(chosen)} onClick={()=>saveVoice(true)}>{selected?'Approve Selected & Save as New Version':'Approve Selected & Save Voice'}</button>}
 {detail&&<div className="saved"><h3>Saved voice history</h3>{detail.versions.map(v=><div className="version" key={v.version}><strong>Version {v.version}{v.version===detail.active_version?' · Current':''}{v.approved_sample_id?' · Approved':''}</strong><div className="actions tight">{v.version!==detail.active_version&&<button onClick={()=>restoreVersion(v.version)}>Restore this version</button>}{detail.versions.length>1&&<button className="danger" onClick={()=>deleteVersion(v.version)}>Delete version</button>}</div>{v.samples.map(s=><div key={s.id}><audio controls src={'/api/designed-samples/'+s.id}/><button disabled={v.approved_sample_id===s.id} onClick={()=>approveExisting(s.id,v.version)}>{v.approved_sample_id===s.id?'Approved voice':'Approve this sample'}</button></div>)}</div>)}<button className="danger" onClick={deleteVoice}>Delete Voice</button></div>}</div>}</section>}
 {tab==='narration'&&<section><div className="heading"><div><h2>Narration Studio</h2><p>Paste text and assign saved voices. Narration recreates each designed voice from its approved recording using the selected cloning model, so the result can sound different from its preview.</p></div><span className="tag">Single or multi-voice</span></div>
 {voiceOptions.length===0&&<div className="notice">Create and approve a voice in Voice Library, or upload a recording, to begin narrating.</div>}
 {blocks.map((b,i)=><div className="script-block" key={b.id}><div className="block-head"><strong>Part {i+1}</strong><select value={b.voice_key} onChange={e=>changeBlock(b.id,'voice_key',e.target.value)}><option value="">Choose a saved voice</option>{voiceOptions.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}</select>{blocks.length>1&&<button onClick={()=>setBlocks(old=>old.filter(x=>x.id!==b.id))}>Remove</button>}</div><textarea placeholder="Paste or type narration here..." value={b.text} onChange={e=>changeBlock(b.id,'text',e.target.value)}/></div>)}
 <div className="actions"><button onClick={()=>setBlocks(old=>[...old,{id:Date.now(),text:'',voice_key:old[old.length-1]?.voice_key||''}])}>+ Add another voice / part</button><label className="inline">Export <select value={format} onChange={e=>setFormat(e.target.value)}><option value="mp3">MP3</option><option value="wav">WAV</option></select></label><button className="primary" onClick={generateNarration} disabled={busy(narrationJob)||!voiceOptions.length}>Generate Audio</button></div>
 {narrationJob&&<div className="job"><p>{narrationJob.message}</p><progress max="100" value={narrationJob.progress}/>{narrationJob.status==='complete'&&<><audio controls src={narrationJob.download_url}/><a className="download" href={narrationJob.download_url} download>Save / Download {narrationJob.download_url.split('.').pop().toUpperCase()}</a><button onClick={()=>setTab('video')}>Add to Video →</button>
  <AudioEditor src={narrationJob.download_url.replace(/\.mp3$/,'.wav')} source={'output:'+narrationJob.job_id} saveLabel="Apply edits" onSaved={j=>{setNarrationJob({...j,job_id:j.download_url.split('/').pop().split('.')[0]});setStatus('Edited narration ready. Video Studio will use this version.')}}/></>}</div>}</section>}
 {tab==='video'&&<section><h2>Video Studio</h2><p>Upload a video, place your narration at a timestamp, and export an MP4.</p><div className="panel"><DropZone accept=".mp4,.mov,.mkv,.webm" onFile={f=>upload(f,'videos')} title="Drop a video" hint="MP4, MOV, MKV or WEBM"/>{video&&<><p>{video.filename}</p><video className="video-preview" controls src={'/api/videos/'+video.video_id}/></>}</div><div className="panel"><h3>Narration track</h3>{narrationJob?.status==='complete'?<><audio controls src={narrationJob.download_url}/><label>Start narration at (seconds)</label><input type="number" min="0" step="0.1" value={offset} onChange={e=>setOffset(e.target.value)}/><label className="check"><input type="checkbox" checked={mix} onChange={e=>setMix(e.target.checked)}/> Mix with original video audio</label><button className="primary" disabled={!video||busy(videoJob)} onClick={renderVideo}>Render Video</button></>:<div className="notice">Generate your narration in Narration Studio first. <button onClick={()=>setTab('narration')}>Open Narration Studio</button></div>}{videoJob&&<div className="job"><p>{videoJob.message}</p><progress max="100" value={videoJob.progress}/>{videoJob.status==='complete'&&<><video className="video-preview" controls src={videoJob.download_url}/><a className="download" href={videoJob.download_url} download>Download MP4</a></>}</div>}</div><p className="hint">Current video support: one combined narration track with a start offset. Multi-track drag-and-drop editing and automatic synchronization are future work.</p></section>}
 {tab==='models'&&<Models/>}
 <footer role="status">{status}</footer></main>
}
createRoot(document.getElementById('root')).render(<App/>);
