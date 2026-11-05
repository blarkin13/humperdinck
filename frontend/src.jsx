import React,{useEffect,useState,useRef} from 'react';
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
import {SECTION_LIMIT,makeSection,replaceSectionText,insertSection,assignSectionSpeaker,moveSection,sectionDelay,DIRECTION_TAGS,spokenText,audioSignature,suggestSpeechDirections} from './narrationSections.js';
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
 const [blocks,setBlocks]=useState([{id:1,text:'',voice_key:'',delay_after:0}]),[activePreview,setActivePreview]=useState(1),[speakerEditor,setSpeakerEditor]=useState(null),[voiceSearch,setVoiceSearch]=useState(''),[draggingSection,setDraggingSection]=useState(null),[playSectionRequest,setPlaySectionRequest]=useState(null),[sectionJob,setSectionJob]=useState(null),[sectionPreviewUrl,setSectionPreviewUrl]=useState(''),[sectionPlayingId,setSectionPlayingId]=useState(null),[audibleSectionId,setAudibleSectionId]=useState(null),[sectionPlayError,setSectionPlayError]=useState(null),[sectionAudio,setSectionAudio]=useState({}),[sectionMenu,setSectionMenu]=useState(null),[sectionPopover,setSectionPopover]=useState(null),[sectionSpeed,setSectionSpeed]=useState({}),[format]=useState('mp3'),[downloadOpen,setDownloadOpen]=useState(false),[narrationJob,setNarrationJob]=useState(null),[wholeAudio,setWholeAudio]=useState(null),[wholeAudible,setWholeAudible]=useState(false),[video,setVideo]=useState(null),[videoJob,setVideoJob]=useState(null),[videoPreviewMode,setVideoPreviewMode]=useState('source'),[offset,setOffset]=useState(0),[mix,setMix]=useState(false);
 const playSequence=useRef(0),hiddenAudio=useRef(null),pendingSignature=useRef(null),wholeAudioRef=useRef(null),wholeCompletedRef=useRef(null),downloadWrapRef=useRef(null);
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
 useEffect(()=>{if(!narrationJob||!['queued','running'].includes(narrationJob.status))return;const timer=setInterval(async()=>{try{const j=await api('jobs/'+narrationJob.job_id);setNarrationJob(old=>({...j,signature:old?.signature}));if(j.status==='failed')setStatus(j.message)}catch(e){setStatus(e.message)}},1000);return()=>clearInterval(timer)},[narrationJob?.job_id,narrationJob?.status]);
 useEffect(()=>{if(!videoJob||!['queued','running'].includes(videoJob.status))return;const timer=setInterval(async()=>{try{const j=await api('jobs/'+videoJob.job_id);setVideoJob(j);if(j.status==='complete')setVideoPreviewMode('rendered');if(j.status==='failed')setStatus(j.message)}catch(e){setStatus(e.message)}},1000);return()=>clearInterval(timer)},[videoJob?.job_id,videoJob?.status]);
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
 async function upload(file,type){if(!file)return;const form=new FormData();form.append('file',file);try{setStatus('Uploading...');const result=await api(type,{method:'POST',body:form});if(type==='voices'){await refresh();setStatus('Voice imported. It is available for narration.')}else{setVideo(result);setVideoJob(null);setVideoPreviewMode('source');setStatus('Video uploaded. Set narration timing and render when ready.')}return result}catch(e){setStatus(e.message)}}
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
 function changeBlock(id,field,value){
  setBlocks(old=>field==='text'?replaceSectionText(old,id,value):field==='voice_key'?assignSectionSpeaker(old,id,value):old.map(b=>b.id===id?{...b,[field]:value}:b));
 }
 function downloadSection(block){
  const saved=sectionAudio[block.id];
  if(saved?.signature!==audioSignature(block)||!saved.url){setSectionPlayError({id:block.id,message:'Generate this section before downloading it.'});return}
  const link=document.createElement('a');
  link.href=saved.url;
  link.download='humperdinck-section-'+blocks.findIndex(b=>b.id===block.id)+'.wav';
  document.body.appendChild(link);link.click();link.remove();
 }
 function setSectionWpm(id,wpm){
  const value=Number(wpm);
  const next=Math.max(60,Math.min(360,Number.isFinite(value)?Math.round(value):180));
  setSectionSpeed(old=>({...old,[id]:next/180}));
 }
 function adjustSectionWpm(id,step){
  setSectionSpeed(old=>{
   const wpm=Math.max(60,Math.min(360,Math.round((old[id]||1)*180/10)*10+step));
   return {...old,[id]:wpm/180};
  });
 }
 function toggleSectionPopover(id,type){
  setSectionMenu(null);
  setSectionPopover(old=>old?.id===id&&old.type===type?null:{id,type});
 }
 function duplicateSection(index){
  setBlocks(old=>{
   const original=old[index];
   if(!original)return old;
   const duplicated={...original,id:makeSection().id};
   return [...old.slice(0,index+1),duplicated,...old.slice(index+1)];
  });
  setSectionMenu(null);
 }
 function resetSectionAudio(id){
  setSectionAudio(old=>{const copy={...old};delete copy[id];return copy});
  setSectionMenu(null);
 }
 useEffect(()=>{
  if(!sectionPopover&&!sectionMenu)return;
  const onPointer=e=>{
   if(!e.target.closest('[data-section-floating-control]')){setSectionPopover(null);setSectionMenu(null)}
  };
  const onKey=e=>{if(e.key==='Escape'){setSectionPopover(null);setSectionMenu(null)}};
  document.addEventListener('pointerdown',onPointer);document.addEventListener('keydown',onKey);
  return()=>{document.removeEventListener('pointerdown',onPointer);document.removeEventListener('keydown',onKey)};
 },[sectionPopover,sectionMenu]);
 function openSpeaker(id){setVoiceSearch('');setSpeakerEditor(id)}
 function selectSpeaker(value){if(speakerEditor!==null)changeBlock(speakerEditor,'voice_key',value);setSpeakerEditor(null)}
 useEffect(()=>{if(speakerEditor===null)return;const onEscape=e=>{if(e.key==='Escape')setSpeakerEditor(null)};window.addEventListener('keydown',onEscape);return()=>window.removeEventListener('keydown',onEscape)},[speakerEditor]);
 function addAfter(index){setBlocks(old=>insertSection(old,index))}
 function reorderSection(fromId,toId){setBlocks(old=>moveSection(old,fromId,toId));setDraggingSection(null)}
 function replaySection(url,id){
  const audio=hiddenAudio.current;
  if(!audio||!url)return;
  if(wholeAudioRef.current){wholeAudioRef.current.pause();wholeAudioRef.current.currentTime=0;setWholeAudible(false)}
  audio.pause();
  setAudibleSectionId(null);
  audio.dataset.sectionId=String(id);
  if(audio.src!==new URL(url,window.location.href).href)audio.src=url;
  audio.currentTime=0;
  audio.playbackRate=sectionSpeed[id]||1;
  audio.play().then(()=>setAudibleSectionId(id)).catch(()=>{setAudibleSectionId(null);setSectionPlayError({id,message:'Your browser blocked automatic playback. Click Play again to retry.'})});
 }
 function stopSection(){
  const audio=hiddenAudio.current;
  if(audio){audio.pause();audio.currentTime=0}
  setAudibleSectionId(null);
 }
 async function playSection(block){
  if(audibleSectionId===block.id){stopSection();return}
  const clean=spokenText(block.text);
  if(!block.voice_key){openSpeaker(block.id);return}
  if(!clean){setSectionPlayError({id:block.id,message:'Enter text before generating audio.'});return}
  const signature=audioSignature(block);
  const existing=sectionAudio[block.id];
  if(existing?.signature===signature){replaySection(existing.url,block.id);return}
  if(sectionPlayingId!==null)return;
  setSectionPlayingId(block.id);setSectionPlayError(null);
  pendingSignature.current={sectionId:block.id,signature};
  if(PUBLIC_STUDIO){setActivePreview(block.id);setPlaySectionRequest({id:++playSequence.current,sectionId:block.id,text:block.text,voice:block.voice_key});return}
  try{
   const result=await api('narrations',json('POST',{blocks:[{text:clean,voice_key:block.voice_key,delay_after:0}],format:'wav'}));
   setSectionJob({...result,sectionId:block.id,signature});
  }catch(e){setSectionPlayingId(null);setSectionPlayError({id:block.id,message:e.message})}
 }
 useEffect(()=>{
  if(!sectionJob||!['queued','running'].includes(sectionJob.status))return;
  const timer=setInterval(async()=>{
   try{
    const next=await api('jobs/'+sectionJob.job_id);
    setSectionJob({...next,sectionId:sectionJob.sectionId,signature:sectionJob.signature});
    if(next.status==='complete'){
     const {sectionId,signature}=sectionJob;
     setSectionAudio(old=>({...old,[sectionId]:{signature,url:next.download_url}}));
     setSectionPlayingId(null);replaySection(next.download_url,sectionId);
    }else if(next.status==='failed'){
     setSectionPlayingId(null);setSectionPlayError({id:sectionJob.sectionId,message:next.message});
    }
   }catch(e){setSectionPlayingId(null);setSectionPlayError({id:sectionJob.sectionId,message:e.message})}
  },1000);
  return()=>clearInterval(timer);
 },[sectionJob?.job_id,sectionJob?.status]);
 useEffect(()=>{
  if(audibleSectionId===null)return;
  const playing=blocks.find(b=>b.id===audibleSectionId);
  const cached=sectionAudio[audibleSectionId];
  if(!playing||cached?.signature!==audioSignature(playing))stopSection();
 },[blocks,sectionAudio,audibleSectionId]);
 function insertTag(id,tag){
  if(!DIRECTION_TAGS.includes(tag))return;
  setBlocks(old=>{
   const b=old.find(section=>section.id===id);
   return b?replaceSectionText(old,id,'['+tag+'] '+b.text):old;
  });
 }
 function suggestTags(id){
  setBlocks(old=>{
   const b=old.find(section=>section.id===id);
   return b?replaceSectionText(old,id,suggestSpeechDirections(b.text)):old;
  });
 }
 function removeBlock(id){setBlocks(old=>old.length>1?old.filter(b=>b.id!==id):old);if(activePreview===id)setActivePreview(blocks.find(b=>b.id!==id)?.id||1)}
 useEffect(()=>{
  if(!downloadOpen)return;
  const dismiss=e=>{if(downloadWrapRef.current&&!downloadWrapRef.current.contains(e.target))setDownloadOpen(false)};
  const onKey=e=>{if(e.key==='Escape')setDownloadOpen(false)};
  document.addEventListener('pointerdown',dismiss);
  document.addEventListener('keydown',onKey);
  return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',onKey)};
 },[downloadOpen]);
 const fullNarrationSignature=JSON.stringify([format,blocks.map(b=>[b.text,b.voice_key,sectionDelay(b.delay_after)])]);
 function stopWholeNarration(){
  const player=wholeAudioRef.current;
  if(player){player.pause();player.currentTime=0}
  setWholeAudible(false);
 }
 function playWholeNarration(url){
  const player=wholeAudioRef.current;
  if(!url||!player)return;
  stopSection();
  if(player.src!==new URL(url,window.location.href).href)player.src=url;
  player.currentTime=0;
  player.play().then(()=>setWholeAudible(true)).catch(()=>setStatus('Playback was blocked. Click Play again.'));
 }
 async function generateNarration(){
  if(wholeAudible){stopWholeNarration();return}
  if(narrationJob&&['queued','running'].includes(narrationJob.status))return;
  if(wholeAudio?.signature===fullNarrationSignature){playWholeNarration(wholeAudio.url);return}
  try{
   if(blocks.some(b=>!spokenText(b.text)||!b.voice_key))throw Error('Every section needs text and a narrator');
   stopWholeNarration();
   const j=await api('narrations',json('POST',{blocks:blocks.map(b=>({text:spokenText(b.text),voice_key:b.voice_key,delay_after:sectionDelay(b.delay_after)})),format}));
   wholeCompletedRef.current=null;
   setNarrationJob({...j,signature:fullNarrationSignature});
   setStatus('Generating narration...');
  }catch(e){setStatus(e.message)}
 }
 useEffect(()=>{
  if(narrationJob?.status!=='complete'||!narrationJob.download_url||wholeCompletedRef.current===narrationJob.job_id)return;
  wholeCompletedRef.current=narrationJob.job_id;
  const saved={url:narrationJob.download_url,signature:narrationJob.signature};
  setWholeAudio(saved);
  if(saved.signature===fullNarrationSignature)playWholeNarration(saved.url);
 },[narrationJob?.status,narrationJob?.job_id,narrationJob?.download_url]);
 useEffect(()=>{
  if(wholeAudible&&wholeAudio?.signature!==fullNarrationSignature)stopWholeNarration();
 },[fullNarrationSignature,wholeAudible,wholeAudio?.signature]);

 async function renderVideo(){try{if(!video||narrationJob?.status!=='complete')throw Error('Upload a video and generate narration first');const j=await api('video-renders',json('POST',{video_id:video.video_id,narration_job_id:narrationJob.job_id,start_seconds:Number(offset),keep_original_audio:mix}));setVideoJob(j);setStatus('Rendering video...')}catch(e){setStatus(e.message)}}
 return <main>{PUBLIC_STUDIO&&<div className="public-app-banner">Browser Studio · Six built-in voices. Custom voice creation, uploads, multi-voice rendering and installs require the desktop app. <a href="/#download">Download info</a> <span className="public-build-version">Build {import.meta.env.VITE_BUILD_ID||'development'}</span></div>}<header><div className="brand"><img src={PUBLIC_STUDIO?"/studio/brand-mark.png":"/brand-mark.png"} alt="" className="brand-mark brand-mark-vintage"/><img src={PUBLIC_STUDIO?"/studio/modern-logo-dark.png":"/modern-logo-dark.png"} alt="" className="brand-mark brand-mark-modern"/><img src={PUBLIC_STUDIO?"/studio/modern-logo-light.png":"/modern-logo-light.png"} alt="" className="brand-mark brand-mark-light"/><div><h1>Humperdinck</h1><small>A modern vintage recording studio</small></div></div><div className="header-actions"><ThemePicker/>{PUBLIC_STUDIO?<><a className="public-app-download" href="/#download">Get desktop app</a><a className="public-app-home" href="/">Website</a></>:<Updates/>}<span className="local"><i className="fa-solid fa-circle"/> {PUBLIC_STUDIO?'Browser preview':'On air · local'}</span></div></header>
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
 <div className="divider"/><h3>Preview before saving</h3><details className="panel"><summary>Inspect the exact voice instruction sent to Qwen</summary><p className="hint">The app combines your description and slider settings into this instruction. Text instructions guide the model but cannot force a particular voice.</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{previewJob?.design_instruction||voicePrompt()}</pre>{previewJob?.design_model&&<small>Preview model: {previewJob.design_model}</small>}</details><label>Sample text</label><textarea className="short" value={previewText} onChange={e=>setPreviewText(e.target.value)} maxLength={600}/><div className="actions voice-creator-icon-actions"><button className="primary voice-icon-action" type="button" aria-label="Generate preview" disabled={PUBLIC_STUDIO||busy(previewJob)||!previewText.trim()||!voicePrompt()} title={PUBLIC_STUDIO?'Available after downloading Humperdinck':'Generate preview'} onClick={preview}><i className={'fa-solid '+(busy(previewJob)?'fa-spinner fa-spin':'fa-wave-square')} aria-hidden="true"/></button><button className="voice-icon-action" type="button" aria-label="Save draft" onClick={()=>saveVoice(false)} disabled={PUBLIC_STUDIO||!voicePrompt()} title={PUBLIC_STUDIO?'Desktop app required':'Save draft'}><i className="fa-solid fa-floppy-disk" aria-hidden="true"/></button></div>{busy(previewJob)&&<div className="job">{previewJob.message}<progress max="100" value={previewJob.progress}/></div>}
 {candidates.filter(c=>c.recipe===recipe()).map((c,i)=><div className={'candidate '+(chosen===c.job_id?'chosen':'')} key={c.job_id}><label><input type="radio" checked={chosen===c.job_id} onChange={()=>setChosen(c.job_id)}/> Candidate {i+1}</label><Player src={c.download_url}/>{!selected&&(savedJobs.includes(c.job_id)?<small>Saved as a voice ✓</small>:<button onClick={()=>saveCandidateAsNew(c)}>Save as new voice</button>)}</div>)}
 {candidates.some(c=>c.recipe===recipe())&&<button className="primary" disabled={busy(previewJob)||savedJobs.includes(chosen)} onClick={()=>saveVoice(true)}>{selected?'Approve Selected & Save as New Version':'Approve Selected & Save Voice'}</button>}
 {detail&&<div className="saved"><h3>Saved voice history</h3>{detail.versions.map(v=><div className="version" key={v.version}><strong>Version {v.version}{v.version===detail.active_version?' · Current':''}{v.approved_sample_id?' · Approved':''}</strong><div className="actions tight">{v.version!==detail.active_version&&<button onClick={()=>restoreVersion(v.version)}>Restore this version</button>}{detail.versions.length>1&&<button className="danger" onClick={()=>deleteVersion(v.version)}>Delete version</button>}</div>{v.samples.map(s=><div key={s.id}><audio controls src={'/api/designed-samples/'+s.id}/><button disabled={v.approved_sample_id===s.id} onClick={()=>approveExisting(s.id,v.version)}>{v.approved_sample_id===s.id?'Approved voice':'Approve this sample'}</button></div>)}</div>)}<button className="danger" onClick={deleteVoice}>Delete Voice</button></div>}</div>}</section>}
 {tab==='narration'&&<section><div className="heading"><div><h2>Narration Studio</h2></div><span className="tag">Single or multi-voice</span></div>
 {voiceOptions.length===0&&<div className="notice">Install a Kokoro or Piper voice in Models for fast narration, or create and approve a custom voice in Voice Creator.</div>}

 <div className="narration-sections">
 {blocks.map((b,i)=><div className={'script-block narration-section '+(PUBLIC_STUDIO&&activePreview===b.id?'section-selected':'')+(draggingSection===b.id?' section-dragging':'')} key={b.id}
 onDragOver={e=>{if(draggingSection!==null)e.preventDefault()}}
 onDrop={e=>{e.preventDefault();if(draggingSection!==null)reorderSection(draggingSection,b.id)}}
 >
  <div className="narration-section-main">
   <div className="narration-editor">
    <div className="narration-editor-header">
     <div className="narration-section-title"><button type="button" className="section-drag-handle" draggable="true" aria-label={'Drag to reorder section '+(i+1)} title="Drag to reorder"
 onDragStart={e=>{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(b.id));setDraggingSection(b.id)}}
 onDragEnd={()=>setDraggingSection(null)}><i className="fa-solid fa-grip-vertical" aria-hidden="true"/></button><strong>Section {i+1}</strong></div>
     <button className="narrator-trigger" type="button" aria-label={'Change narrator for section '+(i+1)} onClick={()=>openSpeaker(b.id)} title="Change narrator">
      <span className="narrator-avatar"><i className={'fa-solid '+(b.voice_key?'fa-microphone-lines':'fa-user-plus')} aria-hidden="true"/></span>
      <span className="narrator-name">{voiceOptions.find(v=>v.value===b.voice_key)?.label||'Choose narrator'}</span>
      <i className="fa-solid fa-chevron-down narrator-chevron" aria-hidden="true"/>
     </button>
    </div>
    <div className="narration-text-wrap"><textarea aria-label={'Text for section '+(i+1)} placeholder="Paste or type narration here..." value={b.text} onChange={e=>changeBlock(b.id,'text',e.target.value)}/>
     <span className="narration-character-count">{Array.from(b.text).length} / {SECTION_LIMIT}</span>
    </div>
    <div className="narration-compact-toolbar">
      <div className="compact-toolbar-left">
       <button type="button" className="icon-action section-play" aria-label={(sectionPlayingId===b.id?'Generating':audibleSectionId===b.id?'Stop':sectionAudio[b.id]?.signature===audioSignature(b)?'Play':'Generate')+' section '+(i+1)} title={(sectionPlayingId===b.id?'Generating audio':audibleSectionId===b.id?'Stop playback':sectionAudio[b.id]?.signature===audioSignature(b)?'Play generated audio':'Generate section audio')+(b.voice_key?'':' · select a narrator first')} disabled={sectionPlayingId!==null} onClick={()=>playSection(b)}>
        <i className={'fa-solid '+(sectionPlayingId===b.id?'fa-spinner fa-spin':audibleSectionId===b.id?'fa-stop':'fa-play')} aria-hidden="true"/>
       </button>
       <div className="section-floating-wrap section-speed-wrap" data-section-floating-control>
        <button type="button" className="icon-action section-speed" onClick={()=>toggleSectionPopover(b.id,'speed')} title="Adjust playback speed" aria-expanded={sectionPopover?.id===b.id&&sectionPopover.type==='speed'} aria-label={'Playback speed '+Number((sectionSpeed[b.id]||1).toFixed(2))+' times. Adjust speed'}>
          <i className="fa-solid fa-gauge-high" aria-hidden="true"/><span>{Number((sectionSpeed[b.id]||1).toFixed(2))}x</span>
        </button>
        {sectionPopover?.id===b.id&&sectionPopover.type==='speed'&&<div className="section-setting-popover" role="group" aria-label={'Speed for section '+(i+1)}>
         <div className="section-setting-heading"><strong>Speed</strong><span>{Number((sectionSpeed[b.id]||1).toFixed(2))}x</span></div>
         <div className="section-setting-adjust">
          <button type="button" aria-label="Decrease speed by 10 words per minute" onClick={()=>adjustSectionWpm(b.id,-10)} disabled={(sectionSpeed[b.id]||1)*180<=60}><i className="fa-solid fa-minus"/></button>
          <label><input type="number" min="60" max="360" step="10" value={Math.round((sectionSpeed[b.id]||1)*180)} onChange={e=>setSectionWpm(b.id,e.target.value)} aria-label="Words per minute"/><span>WPM</span></label>
          <button type="button" aria-label="Increase speed by 10 words per minute" onClick={()=>adjustSectionWpm(b.id,10)} disabled={(sectionSpeed[b.id]||1)*180>=360}><i className="fa-solid fa-plus"/></button>
         </div>
         <small>Playback speed · 180 WPM = 1x</small>
        </div>}
       </div>
      </div>
      <div className="section-floating-wrap section-delay-wrap" data-section-floating-control>
       <button type="button" className="section-delay-pill" title="Adjust delay before next section" aria-label={'Delay after section '+(i+1)+': '+(b.delay_after??0)+' seconds. Adjust delay'} aria-expanded={sectionPopover?.id===b.id&&sectionPopover.type==='delay'} onClick={()=>toggleSectionPopover(b.id,'delay')}>{b.delay_after??0}<span>s</span></button>
       {sectionPopover?.id===b.id&&sectionPopover.type==='delay'&&<div className="section-setting-popover section-delay-popover" role="group" aria-label={'Delay after section '+(i+1)}>
        <div className="section-setting-heading"><strong>Delay</strong><span>{b.delay_after??0}s</span></div>
        <div className="section-setting-adjust">
         <button type="button" aria-label="Decrease delay by half a second" onClick={()=>changeBlock(b.id,'delay_after',sectionDelay(Math.round(((b.delay_after??0)-0.5)*10)/10))} disabled={(b.delay_after??0)===0}><i className="fa-solid fa-minus"/></button>
         <label><input type="number" min="0" max="30" step="0.5" value={b.delay_after??0} onChange={e=>changeBlock(b.id,'delay_after',sectionDelay(e.target.value))} aria-label="Delay in seconds"/><span>sec</span></label>
         <button type="button" aria-label="Increase delay by half a second" onClick={()=>changeBlock(b.id,'delay_after',sectionDelay(Math.round(((b.delay_after??0)+0.5)*10)/10))} disabled={(b.delay_after??0)>=30}><i className="fa-solid fa-plus"/></button>
        </div>
        <small>Silence before the following section</small>
       </div>}
      </div>
      <div className="compact-toolbar-right">
       <button type="button" className="icon-action" aria-label={'Insert section after '+(i+1)} title="Insert section below" onClick={()=>addAfter(i)}><i className="fa-solid fa-plus" aria-hidden="true"/></button>
       <button type="button" className="icon-action" aria-label={'Suggest speech directions for section '+(i+1)} title="Suggest speech directions" onClick={()=>suggestTags(b.id)}><i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true"/></button>
       <button type="button" className="icon-action" aria-label={'Download section '+(i+1)} title="Download generated audio" onClick={()=>downloadSection(b)}><i className="fa-solid fa-download" aria-hidden="true"/></button>
       <div className="section-menu-wrap" data-section-floating-control>
        <button type="button" className="icon-action" aria-label={'More options for section '+(i+1)} title="More options" aria-expanded={sectionMenu===b.id} onClick={()=>{setSectionPopover(null);setSectionMenu(old=>old===b.id?null:b.id)}}><i className="fa-solid fa-ellipsis-vertical" aria-hidden="true"/></button>
        {sectionMenu===b.id&&<div className="section-options-menu">
         <button type="button" onClick={()=>duplicateSection(i)}><i className="fa-regular fa-copy" aria-hidden="true"/> Duplicate section</button>
         {sectionAudio[b.id]?.signature===audioSignature(b)&&<button type="button" onClick={()=>resetSectionAudio(b.id)}><i className="fa-solid fa-rotate" aria-hidden="true"/> Regenerate audio</button>}
         {blocks.length>1&&<button type="button" className="section-options-remove" onClick={()=>{removeBlock(b.id);setSectionMenu(null)}}><i className="fa-solid fa-trash-can" aria-hidden="true"/> Delete section</button>}
        </div>}
       </div>
      </div>
    </div>
    {sectionPlayError?.id===b.id&&<p className="section-play-error" role="alert">{sectionPlayError.message}</p>}
   </div>
  </div>
 </div>)}


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
 <audio ref={hiddenAudio} className="hidden-section-audio" aria-hidden="true" preload="auto" onPlay={e=>setAudibleSectionId(Number(e.currentTarget.dataset.sectionId)||null)} onPause={()=>setAudibleSectionId(null)} onEnded={()=>setAudibleSectionId(null)}/>
 {PUBLIC_STUDIO&&<BrowserKokoro voices={PUBLIC_VOICES.map(v=>[v.key,v.name,v.accent])} voice={blocks.find(b=>b.id===activePreview)?.voice_key||''} text={blocks.find(b=>b.id===activePreview)?.text||''} sectionNumber={Math.max(1,blocks.findIndex(b=>b.id===activePreview)+1)} compact playRequest={playSectionRequest} onPlaybackState={(id,state)=>{if(state==='ready'||state==='error'||state==='idle')setSectionPlayingId(old=>old===id?null:old);else if(state==='generating')setSectionPlayingId(id)}} onSectionAudio={(id,url)=>{if(id===null)return;const pending=pendingSignature.current;if(pending?.sectionId!==id)return;setSectionAudio(old=>({...old,[id]:{signature:pending.signature,url}}));replaySection(url,id)}} onSectionError={(id,message)=>setSectionPlayError({id,message})} />}
 {!PUBLIC_STUDIO&&<div className="actions narration-export-actions"><div className="narration-download-wrap" ref={downloadWrapRef}>
 <button type="button" className="narration-download-trigger" title="Download narration" aria-label="Download narration · MP3 or WAV" aria-haspopup="true" aria-expanded={downloadOpen} onClick={()=>setDownloadOpen(old=>!old)}><i className="fa-solid fa-download" aria-hidden="true"/></button>
 {downloadOpen&&<div className="narration-download-popover" role="group" aria-label="Download narration format">
   <div className="narration-download-heading">Download audio</div>
   {(['mp3','wav']).map(type=>{
    const current=narrationJob?.status==='complete'&&wholeAudio?.signature===fullNarrationSignature;
    const available=current&&(type==='wav'||narrationJob.download_url?.endsWith('.mp3'));
    const href=available?'/api/outputs/'+narrationJob.job_id+'.'+type:null;
    return available?<a className="narration-download-option" href={href} download={'humperdinck-narration.'+type} key={type} onClick={()=>setDownloadOpen(false)}><i className="fa-solid fa-file-audio" aria-hidden="true"/><span><strong>{type.toUpperCase()}</strong><small>{type==='mp3'?'Smaller, widely compatible file':'Uncompressed, best for editing'}</small></span><i className="fa-solid fa-download" aria-hidden="true"/></a>:<div className="narration-download-option unavailable" key={type} aria-disabled="true"><i className="fa-solid fa-file-audio" aria-hidden="true"/><span><strong>{type.toUpperCase()}</strong><small>{type==='mp3'?'Generate audio to download MP3':'Generate audio to download WAV'}</small></span></div>
   })}
 </div>}
 </div><button type="button" className="primary narration-full-play" aria-label={wholeAudible?'Stop narration':wholeAudio?.signature===fullNarrationSignature?'Play narration':'Generate narration'} title={wholeAudible?'Stop narration':wholeAudio?.signature===fullNarrationSignature?'Play narration':'Generate narration'} onClick={generateNarration} disabled={!voiceOptions.length||(['queued','running'].includes(narrationJob?.status))}><i className={'fa-solid '+(['queued','running'].includes(narrationJob?.status)?'fa-spinner fa-spin':wholeAudible?'fa-stop':'fa-play')} aria-hidden="true"/></button><audio ref={wholeAudioRef} className="hidden-section-audio" preload="auto" aria-hidden="true" onPlay={()=>setWholeAudible(true)} onPause={()=>setWholeAudible(false)} onEnded={()=>setWholeAudible(false)}/></div>}
 {PUBLIC_STUDIO&&<p className="hint">The browser generates one selected section at a time. To export a combined multi-speaker narration, use the desktop app.</p>}
 {narrationJob&&<div className="job"><p>{narrationJob.message}</p><progress max="100" value={narrationJob.progress}/>{narrationJob.status==='complete'&&<><button onClick={()=>setTab('video')}>Add to Video →</button>
  <AudioEditor src={narrationJob.download_url.replace(/\.mp3$/,'.wav')} source={'output:'+narrationJob.job_id} saveLabel="Apply edits" onSaved={j=>{setNarrationJob({...j,job_id:j.download_url.split('/').pop().split('.')[0]});setStatus('Edited narration ready. Video Studio will use this version.')}}/></>}</div>}</section>}
 {tab==='video'&&<section className="video-studio">
 <div className="video-studio-heading">
  <div><h2>Video Studio</h2><p>Position narration, preview the result, and download your video.</p></div>
 </div>
 <div className="video-workspace">
  <div className="panel video-stage">
   <div className="video-stage-header">
    <div className="video-stage-title"><i className="fa-solid fa-film" aria-hidden="true"/><strong>Preview</strong></div>
    {videoJob?.status==='complete'&&<div className="video-preview-tabs" role="group" aria-label="Video preview version">
     <button type="button" aria-pressed={videoPreviewMode==='source'} className={videoPreviewMode==='source'?'active':''} onClick={()=>setVideoPreviewMode('source')}>Source</button>
     <button type="button" aria-pressed={videoPreviewMode==='rendered'} className={videoPreviewMode==='rendered'?'active':''} onClick={()=>setVideoPreviewMode('rendered')}>Rendered</button>
    </div>}
   </div>
   {video?
    <div className="video-stage-player"><video key={videoPreviewMode==='rendered'&&videoJob?.status==='complete'?videoJob.download_url:video.video_id} className="video-preview" controls preload="metadata" src={videoPreviewMode==='rendered'&&videoJob?.status==='complete'?videoJob.download_url:'/api/videos/'+video.video_id}/></div>
    :<div className="video-stage-empty"><DropZone disabled={PUBLIC_STUDIO} accept=".mp4,.mov,.mkv,.webm" onFile={file=>upload(file,'videos')} title="Add a video" hint="MP4, MOV, MKV or WEBM"/></div>}
   <div className="video-stage-footer">
    <div className="video-stage-meta">{video?<><i className="fa-regular fa-file-video" aria-hidden="true"/><span title={video.filename}>{video.filename}</span></>:<span>Choose a video to get started</span>}</div>
    <div className="video-stage-actions">
     {video&&<details className="video-replace"><summary title="Replace source video" aria-label="Replace source video"><i className="fa-solid fa-arrow-up-from-bracket" aria-hidden="true"/><span>Replace</span></summary><div className="video-replace-picker"><DropZone disabled={PUBLIC_STUDIO} accept=".mp4,.mov,.mkv,.webm" onFile={file=>upload(file,'videos')} title="Choose replacement video" hint="MP4, MOV, MKV or WEBM"/></div></details>}
     {videoJob?.status==='complete'&&<a className="video-icon-action video-download" href={videoJob.download_url} download aria-label="Download rendered MP4" title="Download rendered MP4"><i className="fa-solid fa-download" aria-hidden="true"/></a>}
    </div>
   </div>
  </div>
  <div className="panel video-controls">
   <div className="video-panel-heading"><h3><i className="fa-solid fa-microphone-lines" aria-hidden="true"/> Narration</h3>
    <button type="button" className="video-icon-action" title="Open Narration Studio" aria-label="Open Narration Studio" onClick={()=>setTab('narration')}><i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"/></button>
   </div>
   {narrationJob?.status==='complete'?<>
     <div className="video-track-status"><i className="fa-solid fa-circle-check" aria-hidden="true"/><span>Audio track ready</span></div>
     <div className="video-setting-row">
      <label htmlFor="video-start-offset">Start time</label>
      <div className="video-time-control"><input id="video-start-offset" type="number" min="0" step="0.1" value={offset} onChange={e=>setOffset(e.target.value)} aria-label="Narration start time in seconds"/><span>seconds</span></div>
     </div>
     <label className="check video-mix-option"><input type="checkbox" checked={mix} onChange={e=>setMix(e.target.checked)}/> Keep original video sound</label>
   </>:<div className="video-no-narration"><i className="fa-solid fa-wave-square" aria-hidden="true"/><p>Generate your narration in Narration Studio to add a soundtrack.</p></div>}
   <div className="video-render-footer">
    <div className="video-render-status">
     <strong>{busy(videoJob)?'Rendering video':videoJob?.status==='complete'?'Render complete':video&&narrationJob?.status==='complete'?'Ready to render':'Waiting for media'}</strong>
     <small>{busy(videoJob)?'Processing your video and narration':videoJob?.status==='complete'?'Preview or download your MP4':video&&narrationJob?.status==='complete'?'Create the finished MP4':'Add a video and narration track'}</small>
    </div>
    <button type="button" className="video-icon-action primary video-render-action" aria-label="Render video" title="Render video" disabled={!video||narrationJob?.status!=='complete'||busy(videoJob)||PUBLIC_STUDIO} onClick={()=>{setVideoPreviewMode('source');renderVideo()}}><i className={'fa-solid '+(busy(videoJob)?'fa-spinner fa-spin':'fa-clapperboard')} aria-hidden="true"/></button>
   </div>
   {videoJob&&<div className="video-render-progress" role="status">
    {videoJob.status!=='complete'&&videoJob.status!=='failed'&&<progress max="100" value={videoJob.progress||0}/>}
    {videoJob.status==='failed'&&<small className="video-render-error">{videoJob.message}</small>}
   </div>}
  </div>
 </div>
 </section>}
 {tab==='models'&&(PUBLIC_STUDIO?<section><h2>Models</h2><p>Download Humperdinck to install and manage local voice models.</p><div className="panel"><h3>Built-in voices</h3><p>The browser preview offers six voices. Other models and downloads are available in the desktop app.</p><button disabled>Install / Download · desktop only</button></div></section>:<Models/>)}
 </main>
}
createRoot(document.getElementById('root')).render(<NotificationProvider><App/></NotificationProvider>);
