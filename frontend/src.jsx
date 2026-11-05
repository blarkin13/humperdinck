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
import ThemePicker from './ThemePicker.jsx';
import BrowserKokoro from './BrowserKokoro.jsx';
import {SECTION_LIMIT,replaceSectionText,insertSection,assignSectionSpeaker,moveSection,sectionDelay} from './narrationSections.js';
import {NotificationProvider,useNotifications} from './Notifications.jsx';
const PUBLIC_STUDIO=import.meta.env.VITE_PUBLIC_STUDIO==='1';
const PUBLIC_VOICES=[['af_heart','Heart','American English · female'],['af_bella','Bella','American English · female'],['af_nicole','Nicole','American English · female'],['am_michael','Michael','American English · male'],['bf_emma','Emma','British English · female'],['bm_daniel','Daniel','British English · male']].map(([key,name,accent])=>({key,name,accent}));
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
const accentPrompts={American:'a General American accent, as heard in US national broadcasting',British:'a natural British English accent from southern England (modern Received Pronunciation), with non-rhotic pronunciation',Australian:'a broad Australian accent, with Australian vowel sounds and rising intonation',Irish:'a natural Irish accent from Dublin, with a soft lilt, Irish vowel sounds and rolled r sounds',Scottish:'a Scottish accent from Glasgow, with rolled r sounds and clipped Scottish vowels',['Southern US']:'a Southern American drawl from Georgia, with stretched vowels and a relaxed rhythm',Canadian:'a Canadian English accent, with Canadian vowel raising',Indian:'an Indian English accent, with syllable-timed rhythm and Indian English intonation',['South African']:'a South African English accent, with clipped vowels and South African intonation',['New Zealand']:'a New Zealand accent, with Kiwi vowel sounds such as centralized short i'};
const accents=['',...Object.keys(accentPrompts)];
// Do not stack an accent preset on top of the same accent already stated by the user.
const accentMentions={
 American:/\b(american|general american|us accent)\b/i,
 British:/\b(british|received pronunciation|southern english|english accent)\b/i,
 Australian:/\b(australian|aussie)\b/i,
 Irish:/\b(irish|dublin accent)\b/i,
 Scottish:/\b(scottish|glasgow accent)\b/i,
 'Southern US':/\b(southern (us|american)|southern drawl|georgia accent)\b/i,
 Canadian:/\bcanadian\b/i,
 Indian:/\bindian\b/i,
 'South African':/\bsouth african\b/i,
 'New Zealand':/\b(new zealand|kiwi accent)\b/i,
};
const styles=['','Audiobook narrator','Documentary','Conversational','News anchor','Storyteller','Commercial','Character / animated','Meditation / calm','Trailer / dramatic'];
const sameTraits=(a,b)=>Object.keys(defaults).every(k=>(a?.[k]??50)===(b?.[k]??50));
const starter='Good evening. I have been waiting a long time to tell you this story.';
// An empty or non-JSON reply means the backend is not running (it crashed or is still starting).
async function api(path,options){if(PUBLIC_STUDIO)throw Error('This feature requires the desktop application.');const r=await fetch('/api/'+path,options);let j;try{j=await r.json()}catch{throw Error('Humperdinck\'s backend is not responding. Check the start.cmd / start.sh window for an error, then restart it.')}if(!r.ok)throw Error(typeof j.detail==='string'?j.detail:JSON.stringify(j.detail||j));return j}
const json=(method,body)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
function App(){
 const {notify,confirm:askConfirm,input:askInput}=useNotifications();
 const [tab,setTab]=useState('voices'),[method,setMethod]=useState('controls'),[designed,setDesigned]=useState([]),[uploads,setUploads]=useState([]),[presets,setPresets]=useState([]),[selected,setSelected]=useState(''),[detail,setDetail]=useState(null);
 const [name,setName]=useState('New voice'),[gender,setGender]=useState('masculine'),[description,setDescription]=useState(''),[settings,setSettings]=useState({...defaults}),[previewText,setPreviewText]=useState(starter),[candidates,setCandidates]=useState([]),[chosen,setChosen]=useState(''),[previewJob,setPreviewJob]=useState(null),[status,setStatus]=useState('');
 const [blocks,setBlocks]=useState([{id:1,text:'',voice_key:'',delay_after:0.3}]),[activePreview,setActivePreview]=useState(1),[speakerEditor,setSpeakerEditor]=useState(null),[voiceSearch,setVoiceSearch]=useState(''),[draggingSection,setDraggingSection]=useState(null),[playSectionRequest,setPlaySectionRequest]=useState(null),[sectionJob,setSectionJob]=useState(null),[sectionPreviewUrl,setSectionPreviewUrl]=useState(''),[format,setFormat]=useState('mp3'),[narrationJob,setNarrationJob]=useState(null),[video,setVideo]=useState(null),[videoJob,setVideoJob]=useState(null),[offset,setOffset]=useState(0),[mix,setMix]=useState(false);
 const [savedReference,setSavedReference]=useState(false),[category,setCategory]=useState(''),[accent,setAccent]=useState(''),[style,setStyle]=useState(''),[uploadSel,setUploadSel]=useState(''),[savedJobs,setSavedJobs]=useState([]);
 useEffect(()=>{
  if(!status)return;
  const failed=/\b(error|failed|could not|not responding|unable|invalid|missing)\b/i.test(status);
  const succeeded=/\b(saved|approved|deleted|imported|uploaded|restored|ready|complete)\b/i.test(status);
  notify(status,failed?'error':succeeded?'success':'info');
 },[status,notify]);
 async function refresh(){try{if(PUBLIC_STUDIO){setDesigned([]);setUploads([]);setPresets(PUBLIC_VOICES);return}const [d,u,p]=await Promise.all([api('designed-voices'),api('voices'),api('preset-voices')]);setDesigned(d);setUploads(u);setPresets(p)}catch(e){setStatus(e.message)}}
 useEffect(()=>{refresh()},[]);
 // Read new preset downloads when returning from Models to Narration Studio.
 useEffect(()=>{if(tab==='narration'||tab==='voices')refresh()},[tab]);
 useEffect(()=>{if(!previewJob||!['queued','running'].includes(previewJob.status))return;const timer=setInterval(async()=>{try{const j=await api('jobs/'+previewJob.job_id);setPreviewJob({...j,design_instruction:previewJob.design_instruction,design_model:previewJob.design_model});if(j.status==='complete'){setCandidates(old=>old.some(c=>c.job_id===j.job_id)?old:[...old,{...j,recipe:previewJob.recipe,design_instruction:previewJob.design_instruction,design_model:previewJob.design_model}]);setChosen(j.job_id);setStatus('Preview ready. Listen and select your favorite.')}else if(j.status==='failed')setStatus(j.message)}catch(e){setStatus(e.message)}},1000);return()=>clearInterval(timer)},[previewJob?.job_id,previewJob?.status]);
 useEffect(()=>{if(!narrationJob||!['queued','running'].includes(narrationJob.status))return;const timer=setInterval(async()=>{try{const j=await api('jobs/'+narrationJob.job_id);setNarrationJob(j);if(j.status==='failed')setStatus(j.message)}catch(e){setStatus(e.message)}},1000);return()=>clearInterval(timer)},[narrationJob?.job_id,narrationJob?.status]);
 useEffect(()=>{if(!videoJob||!['queued','running'].includes(videoJob.status))return;const timer=setInterval(async()=>{try{const j=await api('jobs/'+videoJob.job_id);setVideoJob(j);if(j.status==='failed')setStatus(j.message)}catch(e){setStatus(e.message)}},1000);return()=>clearInterval(timer)},[videoJob?.job_id,videoJob?.status]);
 function designTraits(){return method==='prompt'?{...defaults}:settings}
 function recipe(){return JSON.stringify({gender,description,settings:designTraits(),method,accent,style})}
  function voicePrompt(){
    const base=description.trim();
    if(method==='prompt')return base;
    const describedAccent=accent&&accentMentions[accent]?.test(base);
    const lead=accent&&!describedAccent?`Speak with ${accentPrompts[accent]}. `:'';
    return `${lead}A ${gender}-presenting adult voice${style?` in a ${style.toLowerCase()} style`:''}. ${base}`.trim();
  }
 function newVoice(){setSelected('');setUploadSel('');setDetail(null);setName('New voice');setDescription('');setGender('masculine');setSettings({...defaults});setAccent('');setStyle('');setCategory('');setCandidates([]);setChosen('');setSavedJobs([]);setSavedReference(false)}
 async function openVoice(id){try{const d=await api('designed-voices/'+id);const v=d.versions.find(v=>v.version===d.active_version);setSelected(id);setUploadSel('');setDetail(d);setName(d.name);setCategory(d.category||'');setDescription(v.description);setSettings({...defaults,...v.characteristics});setMethod('prompt');setCandidates([]);setChosen('');setSavedReference(!!v.approved_sample_id);setTab('creator');setStatus('')}catch(e){setStatus(e.message)}}
 async function upload(file,type){if(!file)return;const form=new FormData();form.append('file',file);try{setStatus('Uploading...');const result=await api(type,{method:'POST',body:form});if(type==='voices'){await refresh();setStatus('Voice imported. It is available for narration.')}else{setVideo(result);setStatus('Video uploaded. Generate narration and position it on the timeline.')}return result}catch(e){setStatus(e.message)}}
 async function preview(){try{const prompt=voicePrompt();if(!prompt)throw Error('Describe the voice first');const key=recipe();const j=await api('designed-voices/draft-preview',json('POST',{text:previewText,description:prompt,characteristics:designTraits()}));setPreviewJob({...j,recipe:key});setStatus('Generating preview...')}catch(e){setStatus(e.message)}}
 async function saveVoice(approve){
  try{
   const prompt=voicePrompt();
   if(!prompt.trim())throw Error('Describe the voice first');
   // Validate the selected audio before writing any database changes.
   const candidate=approve?candidates.find(c=>c.job_id===chosen&&c.recipe===recipe()):null;
   if(approve&&!candidate)throw Error('Generate and select a preview for these settings first');
   const isExisting=!!selected;
   const current=detail?.versions?.find(v=>v.version===detail.active_version);
   const changed=!isExisting||!current||current.description!==prompt||!sameTraits(current.characteristics,designTraits());
   let d;
   if(!isExisting){
    d=await api('designed-voices',json('POST',{name,category,description:prompt,characteristics:designTraits(),method:method==='controls'?'sliders':'prompt'}));
   }else if(changed){
    d=await api('designed-voices/'+selected+'/versions',json('POST',{description:prompt,characteristics:designTraits()}));
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
  const voiceName=await askInput('Name for the new voice',name);if(!voiceName)return;
  try{const d=await api('designed-voices',json('POST',{name:voiceName.trim(),category,description:voicePrompt(),characteristics:designTraits(),method:method==='controls'?'sliders':'prompt'}));
   await api(`designed-voices/${d.id}/versions/1/attach-preview`,json('POST',{job_id:c.job_id,approve:true}));
   setSavedJobs(old=>[...old,c.job_id]);await refresh();setStatus(`Saved "${voiceName}" as a new voice.`)}catch(e){setStatus('Save failed: '+e.message)}}
 async function deleteVersion(version){
  if(!await askConfirm(`Delete version ${version} and its samples?`,{title:'Delete voice version',confirmLabel:'Delete version',danger:true}))return;
  try{await api(`designed-voices/${selected}/versions/${version}`,{method:'DELETE'});await refresh();await openVoice(selected);setStatus(`Version ${version} deleted.`)}catch(e){setStatus(e.message)}}
 async function deleteDesigned(id,voiceName){if(!await askConfirm(`Delete "${voiceName}" and all its versions?`,{title:'Delete voice',confirmLabel:'Delete voice',danger:true}))return;try{await api('designed-voices/'+id,{method:'DELETE'});if(selected===id)newVoice();await refresh()}catch(e){setStatus(e.message)}}
 async function deleteUpload(id,voiceName){if(!await askConfirm(`Delete uploaded voice "${voiceName}"?`,{title:'Delete recording',confirmLabel:'Delete recording',danger:true}))return;try{await api('voices/'+id,{method:'DELETE'});if(uploadSel===id)newVoice();setBlocks(old=>old.map(b=>b.voice_key==='upload:'+id?{...b,voice_key:''}:b));await refresh()}catch(e){setStatus(e.message)}}
 async function updateUpload(id,changes){try{await api('voices/'+id,json('PATCH',changes));await refresh()}catch(e){setStatus(e.message)}}
 function openUpload(id){newVoice();setUploadSel(id);setMethod('upload');setTab('creator')}
 async function restoreVersion(version){
  try{await api(`designed-voices/${selected}/versions/${version}/activate`,{method:'POST'});await refresh();await openVoice(selected);setStatus('Version '+version+' restored as current.');}
  catch(e){setStatus(e.message)}
 }

 async function deleteVoice(){if(!selected||!await askConfirm('Delete this voice?',{title:'Delete voice',confirmLabel:'Delete voice',danger:true}))return;try{await api('designed-voices/'+selected,{method:'DELETE'});newVoice();await refresh()}catch(e){setStatus(e.message)}}
 async function approveExisting(sample,version){try{await api(`designed-voices/${selected}/versions/${version}/approve/${sample}`,{method:'POST'});await openVoice(selected);setStatus('Reference approved.')}catch(e){setStatus(e.message)}}
 const duplicatedPresetNames=new Set(presets.map(v=>v.name).filter((name,i,all)=>all.indexOf(name)!==i));
  const voiceOptions=[...presets.map(v=>({value:v.key,label:v.name+(duplicatedPresetNames.has(v.name)?' · '+(v.accent||'').split(' · ')[0]:''),accent:v.accent||'Built-in voice'})),...designed.filter(v=>v.narration_sample_id).map(v=>({value:'design:'+v.id,label:v.name,accent:v.description||'Custom designed voice'})),...uploads.map(v=>({value:'upload:'+v.voice_id,label:v.filename,accent:'Recorded / uploaded voice'}))];
 const busy=job=>['queued','running'].includes(job?.status);
 function changeBlock(id,field,value){setBlocks(old=>field==='text'?replaceSectionText(old,id,value):field==='voice_key'?assignSectionSpeaker(old,id,value):old.map(b=>b.id===id?{...b,[field]:value}:b))}
 function openSpeaker(id){setVoiceSearch('');setSpeakerEditor(id)}
 function selectSpeaker(value){if(speakerEditor!==null)changeBlock(speakerEditor,'voice_key',value);setSpeakerEditor(null)}
 useEffect(()=>{if(speakerEditor===null)return;const onEscape=e=>{if(e.key==='Escape')setSpeakerEditor(null)};window.addEventListener('keydown',onEscape);return()=>window.removeEventListener('keydown',onEscape)},[speakerEditor]);
 function addAfter(index){setBlocks(old=>insertSection(old,index))}
 function reorderSection(fromId,toId){setBlocks(old=>moveSection(old,fromId,toId));setDraggingSection(null)}
 async function playSection(block){
  if(!block.text.trim()||!block.voice_key){setStatus('Choose a narrator and enter text before playing this section.');return}
  if(PUBLIC_STUDIO){setActivePreview(block.id);setPlaySectionRequest({id:Date.now(),text:block.text,voice:block.voice_key});return}
  try{setSectionPreviewUrl('');const result=await api('narrations',json('POST',{blocks:[{text:block.text,voice_key:block.voice_key,delay_after:0}],format:'wav'}));setSectionJob(result);setStatus('Generating section preview...')}catch(e){setStatus(e.message)}
 }
 useEffect(()=>{if(!sectionJob||!['queued','running'].includes(sectionJob.status))return;const timer=setInterval(async()=>{try{const next=await api('jobs/'+sectionJob.job_id);setSectionJob(next);if(next.status==='complete')setSectionPreviewUrl(next.download_url);else if(next.status==='failed')setStatus(next.message)}catch(e){setStatus(e.message)}},1000);return()=>clearInterval(timer)},[sectionJob?.job_id,sectionJob?.status]);
 function removeBlock(id){setBlocks(old=>old.length>1?old.filter(b=>b.id!==id):old);if(activePreview===id)setActivePreview(blocks.find(b=>b.id!==id)?.id||1)}
 async function generateNarration(){try{if(blocks.some(b=>!b.text.trim()||!b.voice_key))throw Error('Every block needs text and an approved voice');const j=await api('narrations',json('POST',{blocks:blocks.map(b=>({text:b.text,voice_key:b.voice_key,delay_after:sectionDelay(b.delay_after)})),format}));setNarrationJob(j);setStatus('Generating narration...')}catch(e){setStatus(e.message)}}
 async function renderVideo(){try{if(!video||narrationJob?.status!=='complete')throw Error('Upload a video and generate narration first');const j=await api('video-renders',json('POST',{video_id:video.video_id,narration_job_id:narrationJob.job_id,start_seconds:Number(offset),keep_original_audio:mix}));setVideoJob(j);setStatus('Rendering video...')}catch(e){setStatus(e.message)}}
 return <main>{PUBLIC_STUDIO&&<div className="public-app-banner">Browser Studio · Six built-in voices. Custom voice creation, uploads, multi-voice rendering and installs require the desktop app. <a href="/#download">Download info</a> <span className="public-build-version">Build {import.meta.env.VITE_BUILD_ID||'development'}</span></div>}<header><div className="brand"><img src={PUBLIC_STUDIO?"/studio/brand-mark.png":"/brand-mark.png"} alt="" className="brand-mark brand-mark-vintage"/><img src={PUBLIC_STUDIO?"/studio/brand-modern.png":"/brand-modern.png"} alt="" className="brand-mark brand-mark-modern"/><div><h1>Humperdinck</h1><small>A modern vintage recording studio</small></div></div><div className="header-actions"><ThemePicker/>{PUBLIC_STUDIO?<><a className="public-app-download" href="/#download">Get desktop app</a><a className="public-app-home" href="/">Website</a></>:<Updates/>}<span className="local"><i className="fa-solid fa-circle"/> {PUBLIC_STUDIO?'Browser preview':'On air · local'}</span></div></header>
 <nav>{[['voices','Voice Library','fa-record-vinyl'],['creator','Voice Creator','fa-wand-magic-sparkles'],['narration','Narration Studio','fa-sliders'],['video','Video Studio','fa-film'],['models','Models','fa-microchip']].map(([id,label,icon])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}><i className={'fa-solid '+icon}/> {label}</button>)}</nav>
 {tab==='voices'&&<section><div className="heading"><div><h2>Voice Library</h2><p>Browse built-in and saved voices. Select a built-in voice for narration or edit your own voices in Voice Creator.</p></div><button className="primary" onClick={()=>{newVoice();setMethod('controls');setTab('creator')}}><i className="fa-solid fa-plus"/> New voice</button></div>
 <VoiceGrid previewDisabled={PUBLIC_STUDIO} onPreviewVoice={PUBLIC_STUDIO?(v)=>{setBlocks(old=>assignSectionSpeaker(old,old[0]?.id,v.key));setTab('narration')}:undefined} onCreate={()=>{newVoice();setMethod("controls");setTab("creator")}} items={[...presets.map(v=>({key:v.key,voiceKey:v.key,method:'preset',name:v.name,category:'Built-in · '+v.accent.split(' · ')[0],ready:true,status:'Ready for narration',summary:v.accent,traits:[v.accent],specs:[],onOpen:()=>{setBlocks(old=>assignSectionSpeaker(old,old[0]?.id,v.key));setTab('narration');}})),...designed.map(v=>({key:'d'+v.id,voiceKey:'design:'+v.id,method:v.method||'designed',name:v.name,category:'My Voices',selected:selected===v.id,ready:!!v.narration_sample_id,
  status:v.narration_sample_id?'Ready · v'+v.narration_version+' approved':'Draft · v'+v.active_version,summary:voiceSummary(v),
  meters:['pitch','rasp','pace','warmth'].map(k=>[traitLabels[k][0],v.characteristics?.[k]??50,traitLabels[k][1],traitLabels[k][2]]),
  specs:[['fa-solid fa-code-branch',v.version_count,'Versions'],['fa-solid fa-compact-disc',v.sample_count,'Preview takes'],['fa-regular fa-calendar',ago(v.updated_at),'Last changed']],
  previewUrl:v.preview_sample_id&&'/api/designed-samples/'+v.preview_sample_id,onOpen:()=>openVoice(v.id),onDelete:()=>deleteDesigned(v.id,v.name)})),
  ...uploads.map(v=>({key:'u'+v.voice_id,voiceKey:'upload:'+v.voice_id,method:v.origin||'uploaded',name:v.filename,category:'My Voices',selected:uploadSel===v.voice_id,ready:true,status:'Ready for narration',
  summary:`${v.duration?v.duration+'-second ':''}${v.channels===2?'stereo':'mono'} reference clip used to clone this voice.${v.duration&&v.duration<10?' Longer clips (10–30 s) clone more reliably.':''}`,
  traits:[v.sample_rate&&(v.sample_rate/1000).toFixed(1)+' kHz',v.size_kb&&Math.round(v.size_kb/102.4)/10+' MB'].filter(Boolean),
  specs:[v.duration&&['fa-regular fa-clock',v.duration+'s','Length'],['fa-regular fa-calendar',ago(v.added_at),'Added']],
  previewUrl:'/api/voices/'+v.voice_id+'/audio',onOpen:()=>openUpload(v.voice_id),onDelete:()=>deleteUpload(v.voice_id,v.filename)}))]}/>
 </section>}
  {tab==='creator'&&<section><div className="heading"><div><h2>Voice Creator</h2><p>{selected?'Edit, preview and approve a new version of your saved voice.':uploadSel?'Manage or refine this voice recording.':'Design, describe, record or upload a voice, then preview and save it to your library.'}</p></div><button onClick={()=>setTab('voices')}><i className="fa-solid fa-arrow-left"/> Back to Voice Library</button></div>
  <datalist id="categories">{[...new Set([...designed,...uploads].map(v=>v.category).filter(Boolean))].map(c=><option key={c} value={c}/>)}</datalist>
 <h3>{selected?'Edit designed voice':uploadSel?'Edit recorded voice':'Create a voice'}</h3><div className="method-grid">{[['upload','Upload Audio','Clone from a recording','fa-file-audio'],['record','Record with Mic','Record your own voice','fa-microphone'],['controls','Design with Sliders','Choose vocal characteristics','fa-sliders'],['prompt','Describe a Voice','Write what you want to hear','fa-feather-pointed']].map(([id,title,subtitle,icon])=><button disabled={PUBLIC_STUDIO&&(id==='upload'||id==='record')} title={PUBLIC_STUDIO&&(id==='upload'||id==='record')?'Download the desktop app to upload or record':''} className={'method '+(method===id?'active':'')} key={id} onClick={()=>{setMethod(id);setCandidates([]);setChosen('')}}><i className={'fa-solid method-icon '+icon}/><strong>{title}</strong><small>{subtitle}</small></button>)}</div>
 {method==='record'?<div className="panel"><h3>Record with your microphone</h3><Recorder onSave={async f=>{const r=await upload(f,'voices');if(r){openUpload(r.voice_id);setStatus('Recording saved and ready for narration. Trim or clean it up below if needed.')}}}/></div>:method==='upload'?<div className="panel"><h3>Upload a voice reference</h3><DropZone accept=".wav,.mp3,.flac,.m4a,.ogg" onFile={f=>upload(f,'voices')} title="Drop a voice recording" hint="A clear recording you own or have permission to clone. WAV, MP3, FLAC, M4A or OGG, up to 30 MB. 10–30 seconds of clean speech works best."/>
  {(()=>{const u=uploads.find(v=>v.voice_id===uploadSel);if(!u)return null;return <div className="saved"><h3>{u.filename}</h3><div className="field-row"><div className="field"><label>Name</label><input defaultValue={u.filename} key={'n'+u.voice_id} onBlur={e=>e.target.value.trim()&&e.target.value!==u.filename&&updateUpload(u.voice_id,{name:e.target.value.trim()})}/></div><div className="field"><label>Category</label><input list="categories" defaultValue={u.category} key={'c'+u.voice_id} placeholder="e.g. Narrators" onBlur={e=>e.target.value!==u.category&&updateUpload(u.voice_id,{category:e.target.value})}/></div></div>
   <p className="hint">Trim to the cleanest speech and remove noise for a better clone.</p><AudioEditor src={'/api/voices/'+u.voice_id+'/audio'} source={'upload:'+u.voice_id} allowReplace saveLabel="Save as new voice" onSaved={async j=>{await refresh();if(j.voice_id!==u.voice_id)setUploadSel(j.voice_id);setStatus('Edited voice saved.')}}/></div>})()}</div>:<div className="panel"><div className="field-row"><div className="field"><label>Voice name</label><input value={name} onChange={e=>setName(e.target.value)}/></div><div className="field"><label>Category</label><input list="categories" value={category} onChange={e=>setCategory(e.target.value)} placeholder="e.g. Narrators, Villains"/></div></div>{method==='controls'&&<><label>Voice presentation</label><div className="toggle">{[['masculine','Male'],['feminine','Female']].map(([id,label])=><button key={id} className={gender===id?'active':''} onClick={()=>setGender(id)}>{label}</button>)}</div><div className="field-row"><div className="field"><label>Accent</label><select value={accent} onChange={e=>setAccent(e.target.value)}>{accents.map(a=><option key={a} value={a}>{a||'No preference'}</option>)}</select></div><div className="field"><label>Style</label><select value={style} onChange={e=>setStyle(e.target.value)}>{styles.map(a=><option key={a} value={a}>{a||'No preference'}</option>)}</select></div></div>
  <div className="slider-grid">{Object.keys(defaults).map(k=><div key={k}><label>{traitLabels[k][0]} <span>{settings[k]}</span></label><input type="range" min="0" max="100" value={settings[k]} onChange={e=>setSettings({...settings,[k]:+e.target.value})}/><div className="range-ends"><small>{traitLabels[k][1]}</small><small>{traitLabels[k][2]}</small></div></div>)}</div><div className="actions tight"><button onClick={()=>setSettings({...defaults})}>Reset sliders</button><button onClick={()=>setSettings(Object.fromEntries(Object.keys(defaults).map(k=>[k,Math.round(15+Math.random()*70)])))}>Randomize</button></div><p className="hint">Sliders are used only in Design with Sliders. Describe a Voice sends just your written prompt. Accents are not guaranteed; a real accent reference used with cloning is more reliable.</p></>}
 <label>{method==='prompt'?'Describe the voice':'Additional voice details (optional)'}</label><textarea className="short" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Example: A relaxed, gravelly American narrator with a dry sense of humor."/>
 <div className="divider"/><h3>Preview before saving</h3><details className="panel"><summary>Inspect the exact voice instruction sent to Qwen</summary><p className="hint">The app combines your description and slider settings into this instruction. Text instructions guide the model but cannot force a particular voice.</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{previewJob?.design_instruction||voicePrompt()}</pre>{previewJob?.design_model&&<small>Preview model: {previewJob.design_model}</small>}</details><label>Sample text</label><textarea className="short" value={previewText} onChange={e=>setPreviewText(e.target.value)} maxLength={600}/><div className="actions"><button className="primary" disabled={PUBLIC_STUDIO||busy(previewJob)||!previewText.trim()||!voicePrompt()} title={PUBLIC_STUDIO?'Available after downloading Humperdinck':undefined} onClick={preview}>{busy(previewJob)?'Generating...':'Generate Preview'}</button><button onClick={()=>saveVoice(false)} disabled={PUBLIC_STUDIO||!voicePrompt()} title={PUBLIC_STUDIO?'Desktop app required':undefined}>Save Draft</button></div>{busy(previewJob)&&<div className="job">{previewJob.message}<progress max="100" value={previewJob.progress}/></div>}
 {candidates.filter(c=>c.recipe===recipe()).map((c,i)=><div className={'candidate '+(chosen===c.job_id?'chosen':'')} key={c.job_id}><label><input type="radio" checked={chosen===c.job_id} onChange={()=>setChosen(c.job_id)}/> Candidate {i+1}</label><Player src={c.download_url}/>{!selected&&(savedJobs.includes(c.job_id)?<small>Saved as a voice ✓</small>:<button onClick={()=>saveCandidateAsNew(c)}>Save as new voice</button>)}</div>)}
 {candidates.some(c=>c.recipe===recipe())&&<button className="primary" disabled={busy(previewJob)||savedJobs.includes(chosen)} onClick={()=>saveVoice(true)}>{selected?'Approve Selected & Save as New Version':'Approve Selected & Save Voice'}</button>}
 {detail&&<div className="saved"><h3>Saved voice history</h3>{detail.versions.map(v=><div className="version" key={v.version}><strong>Version {v.version}{v.version===detail.active_version?' · Current':''}{v.approved_sample_id?' · Approved':''}</strong><div className="actions tight">{v.version!==detail.active_version&&<button onClick={()=>restoreVersion(v.version)}>Restore this version</button>}{detail.versions.length>1&&<button className="danger" onClick={()=>deleteVersion(v.version)}>Delete version</button>}</div>{v.samples.map(s=><div key={s.id}><audio controls src={'/api/designed-samples/'+s.id}/><button disabled={v.approved_sample_id===s.id} onClick={()=>approveExisting(s.id,v.version)}>{v.approved_sample_id===s.id?'Approved voice':'Approve this sample'}</button></div>)}</div>)}<button className="danger" onClick={deleteVoice}>Delete Voice</button></div>}</div>}</section>}
 {tab==='narration'&&<section><div className="heading"><div><h2>Narration Studio</h2></div><span className="tag">Single or multi-voice</span></div>
 {voiceOptions.length===0&&<div className="notice">Install a Kokoro or Piper voice in Models for fast narration, or create and approve a custom voice in Voice Creator.</div>}
 <p className="hint">Paste a long script into any section. Narration Studio splits text into sections of up to {SECTION_LIMIT} characters, favoring sentence breaks. Each new section uses the previous speaker until you choose another.</p>
 <div className="narration-sections">
 {blocks.map((b,i)=><div className={'script-block narration-section '+(PUBLIC_STUDIO&&activePreview===b.id?'section-selected':'')+(draggingSection===b.id?' section-dragging':'')} key={b.id}
 onDragOver={e=>{if(draggingSection!==null)e.preventDefault()}}
 onDrop={e=>{e.preventDefault();if(draggingSection!==null)reorderSection(draggingSection,b.id)}}
 >
  <div className="narration-section-main">
   <button className="narrator-trigger" type="button" aria-label={'Change narrator for section '+(i+1)} onClick={()=>openSpeaker(b.id)} title="View narrator details or change narrator">
    <span className="narrator-avatar"><i className={'fa-solid '+(b.voice_key?'fa-microphone-lines':'fa-user-plus')} aria-hidden="true"/></span>
    <span className="narrator-name">{voiceOptions.find(v=>v.value===b.voice_key)?.label||'Choose narrator'}</span>
    <i className="fa-solid fa-chevron-down narrator-chevron" aria-hidden="true"/>
   </button>
   <div className="narration-editor">
    <div className="narration-editor-header"><div className="narration-section-title"><button type="button" className="section-drag-handle" draggable="true" aria-label={'Drag to reorder section '+(i+1)} title="Drag to reorder"
 onDragStart={e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(b.id));setDraggingSection(b.id)}}
 onDragEnd={()=>setDraggingSection(null)}><i className="fa-solid fa-grip-vertical" aria-hidden="true"/></button><strong>Section {i+1}</strong></div><span>{Array.from(b.text).length} / {SECTION_LIMIT}</span></div>
    <textarea aria-label={'Text for section '+(i+1)} placeholder="Paste or type narration here..." value={b.text} onChange={e=>changeBlock(b.id,'text',e.target.value)}/>
    <div className="section-foot">
     <button type="button" className="section-play" disabled={!b.text.trim()||!b.voice_key||busy(sectionJob)} onClick={()=>playSection(b)}><i className="fa-solid fa-play" aria-hidden="true"/> Play section</button>
     <label className="section-delay">Pause after <input type="number" aria-label={'Pause after section '+(i+1)+' in seconds'} min="0" max="30" step="0.1" value={b.delay_after??0.3} onChange={e=>changeBlock(b.id,'delay_after',sectionDelay(e.target.value))}/> <span>s</span></label>
     <button type="button" onClick={()=>addAfter(i)} title={'Insert a section after section '+(i+1)}><i className="fa-solid fa-plus" aria-hidden="true"/> Insert below</button>
     {blocks.length>1&&<button type="button" onClick={()=>removeBlock(b.id)}><i className="fa-solid fa-trash-can" aria-hidden="true"/> Remove</button>}
     {PUBLIC_STUDIO&&<button className={activePreview===b.id?'active':''} onClick={()=>setActivePreview(b.id)} type="button"><i className="fa-solid fa-play" aria-hidden="true"/> {activePreview===b.id?'Selected for preview':'Preview section'}</button>}
    </div>
   </div>
  </div>
 </div>)}
 {!PUBLIC_STUDIO&&sectionPreviewUrl&&<div className="section-preview-player"><strong>Section preview</strong><audio key={sectionPreviewUrl} autoPlay controls src={sectionPreviewUrl}/></div>}
 <button className="section-add" type="button" onClick={()=>addAfter(blocks.length-1)}>+ Add section</button>
 </div>
 {speakerEditor!==null&&(()=>{
  const sectionIndex=blocks.findIndex(b=>b.id===speakerEditor);
  const current=blocks[sectionIndex];
  const selectedVoice=voiceOptions.find(v=>v.value===current?.voice_key);
  const filter=voiceSearch.trim().toLowerCase();
  const filtered=voiceOptions.filter(v=>!filter||v.label.toLowerCase().includes(filter)||String(v.accent||'').toLowerCase().includes(filter));
  return <div className="narrator-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSpeakerEditor(null)}}>
   <div className="narrator-modal" role="dialog" aria-modal="true" aria-label={'Choose narrator for section '+(sectionIndex+1)}>
    <div className="narrator-modal-head"><div><h3>Section {sectionIndex+1} narrator</h3><p>Choose a voice for this section. Unassigned following sections will inherit it.</p></div><button type="button" className="narrator-close" onClick={()=>setSpeakerEditor(null)} aria-label="Close narrator selector"><i className="fa-solid fa-xmark"/></button></div>
    <div className="narrator-current"><span className="narrator-avatar"><i className="fa-solid fa-microphone-lines"/></span><div><strong>{selectedVoice?.label||'No narrator selected'}</strong><small>{selectedVoice?.accent||'Select a voice from the library below.'}</small></div></div>
    <label className="narrator-search"><i className="fa-solid fa-magnifying-glass" aria-hidden="true"/><input autoFocus value={voiceSearch} onChange={e=>setVoiceSearch(e.target.value)} placeholder="Search voices" aria-label="Search narrator voices"/></label>
    <div className="narrator-options">{filtered.length?filtered.map(v=><button type="button" className={'narrator-option '+(current?.voice_key===v.value?'selected':'')} key={v.value} onClick={()=>selectSpeaker(v.value)}>
     <span className="narrator-avatar"><i className={'fa-solid '+(v.value.startsWith('design:')?'fa-wand-magic-sparkles':v.value.startsWith('upload:')?'fa-file-audio':'fa-microphone-lines')}/></span>
     <span className="narrator-option-text"><strong>{v.label}</strong><small>{v.accent|| (v.value.startsWith('design:')?'Custom designed voice':v.value.startsWith('upload:')?'Uploaded voice':'Built-in voice')}</small></span>
     {current?.voice_key===v.value&&<i className="fa-solid fa-check" aria-label="Selected"/>}
    </button>):<p className="hint">No voices match this search.</p>}</div>
    <div className="narrator-modal-footer"><button type="button" onClick={()=>selectSpeaker('')}>Clear narrator</button><button type="button" onClick={()=>setSpeakerEditor(null)}>Cancel</button></div>
   </div>
  </div>;
 })()}
 {PUBLIC_STUDIO&&<BrowserKokoro voices={PUBLIC_VOICES.map(v=>[v.key,v.name,v.accent])} voice={blocks.find(b=>b.id===activePreview)?.voice_key||''} text={blocks.find(b=>b.id===activePreview)?.text||''} sectionNumber={Math.max(1,blocks.findIndex(b=>b.id===activePreview)+1)} playRequest={playSectionRequest} />}
 {!PUBLIC_STUDIO&&<div className="actions"><label className="inline">Export <select value={format} onChange={e=>setFormat(e.target.value)}><option value="mp3">MP3</option><option value="wav">WAV</option></select></label><button className="primary" onClick={generateNarration} disabled={busy(narrationJob)||!voiceOptions.length}>Generate Audio</button></div>}
 {PUBLIC_STUDIO&&<p className="hint">The browser generates one selected section at a time. To export a combined multi-speaker narration, use the desktop app.</p>}
 {narrationJob&&<div className="job"><p>{narrationJob.message}</p><progress max="100" value={narrationJob.progress}/>{narrationJob.status==='complete'&&<><audio controls src={narrationJob.download_url}/><a className="download" href={narrationJob.download_url} download>Save / Download {narrationJob.download_url.split('.').pop().toUpperCase()}</a><button onClick={()=>setTab('video')}>Add to Video →</button>
  <AudioEditor src={narrationJob.download_url.replace(/\.mp3$/,'.wav')} source={'output:'+narrationJob.job_id} saveLabel="Apply edits" onSaved={j=>{setNarrationJob({...j,job_id:j.download_url.split('/').pop().split('.')[0]});setStatus('Edited narration ready. Video Studio will use this version.')}}/></>}</div>}</section>}
 {tab==='video'&&<section><h2>Video Studio</h2><p>Upload a video, place your narration at a timestamp, and export an MP4.</p><div className="panel"><DropZone disabled={PUBLIC_STUDIO} accept=".mp4,.mov,.mkv,.webm" onFile={f=>upload(f,'videos')} title="Drop a video" hint="MP4, MOV, MKV or WEBM"/>{video&&<><p>{video.filename}</p><video className="video-preview" controls src={'/api/videos/'+video.video_id}/></>}</div><div className="panel"><h3>Narration track</h3>{narrationJob?.status==='complete'?<><audio controls src={narrationJob.download_url}/><label>Start narration at (seconds)</label><input type="number" min="0" step="0.1" value={offset} onChange={e=>setOffset(e.target.value)}/><label className="check"><input type="checkbox" checked={mix} onChange={e=>setMix(e.target.checked)}/> Mix with original video audio</label><button className="primary" disabled={!video||busy(videoJob)} onClick={renderVideo}>Render Video</button></>:<div className="notice">Generate your narration in Narration Studio first. <button onClick={()=>setTab('narration')}>Open Narration Studio</button></div>}{videoJob&&<div className="job"><p>{videoJob.message}</p><progress max="100" value={videoJob.progress}/>{videoJob.status==='complete'&&<><video className="video-preview" controls src={videoJob.download_url}/><a className="download" href={videoJob.download_url} download>Download MP4</a></>}</div>}</div><p className="hint">Current video support: one combined narration track with a start offset. Multi-track drag-and-drop editing and automatic synchronization are future work.</p></section>}
 {tab==='models'&&(PUBLIC_STUDIO?<section><h2>Models</h2><p>Download Humperdinck to install and manage local voice models.</p><div className="panel"><h3>Built-in voices</h3><p>The browser preview offers six voices. Other models and downloads are available in the desktop app.</p><button disabled>Install / Download · desktop only</button></div></section>:<Models/>)}
 </main>
}
createRoot(document.getElementById('root')).render(<NotificationProvider><App/></NotificationProvider>);
