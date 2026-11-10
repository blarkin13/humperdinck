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
import ServerSettings from './ServerSettings.jsx';
import Recorder from './Recorder.jsx';
import Models from './Models.jsx';
import FirstRunSetup from './FirstRunSetup.jsx';
import ThemePicker from './ThemePicker.jsx';
import AccountPanel from './AccountPanel.jsx';
import BrowserKokoro from './BrowserKokoro.jsx';
import SoundEffects from './SoundEffects.jsx';
import UploadedVoiceRefinement from './UploadedVoiceRefinement.jsx';
import PronunciationPanel from './PronunciationPanel.jsx';
import VoiceCatalog from './VoiceCatalog.jsx';
import NarratorPicker from './NarratorPicker.jsx';
import CharactersPanel from './CharactersPanel.jsx';
import VideoStudio from './VideoStudio.jsx';
import SoundDesk,{DEFAULT_DESK,useDeskPreview} from './SoundDesk.jsx';
import {SECTION_LIMIT,makeSection,replaceSectionText,insertSection,assignSectionSpeaker,moveSection,sectionDelay,DIRECTION_TAGS,spokenText,audioSignature,audioResultIsCurrent,wholeNarrationSignature,suggestSpeechDirections} from './narrationSections.js';
import {NotificationProvider,useNotifications} from './Notifications.jsx';
import './shell.css'; // last: app layout and finish over every theme
const PUBLIC_STUDIO=import.meta.env.VITE_PUBLIC_STUDIO==='1';
const PUBLIC_VOICES=[['af_heart','Heart','American English · female'],['af_bella','Bella','American English · female'],['af_nicole','Nicole','American English · female'],['am_michael','Michael','American English · male'],['bf_emma','Emma','British English · female'],['bm_daniel','Daniel','British English · male']].map(([key,name,accent])=>({key,name,accent}));
// An audio player that says so (with a download link) when the browser cannot play the clip.
function Player({src}){const [failed,setFailed]=useState(false);
 return failed?<p className="notice"><i className="fa-solid fa-triangle-exclamation"/> This browser could not play the clip. <a href={src} download>Download it</a> to listen.</p>
  :<audio controls preload="metadata" src={src} onError={()=>setFailed(true)}/>}

// A failed update check must never take down the recording studios.
class UpdateWidgetBoundary extends React.Component {
 constructor(props){super(props);this.state={failed:false}}
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(error){console.error('Humperdinck update control failed:',error)}
 render(){return this.state.failed
  ?<span className="hint" title="Updates are temporarily unavailable. The rest of Humperdinck still works."><i className="fa-solid fa-circle-exclamation" aria-hidden="true"/> Updates unavailable</span>
  :this.props.children}
}

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
const sameTraits=(a,b)=>Object.keys(defaults).every(k=>(a?.[k]??50)===(b?.[k]??50));
const starter='Good evening. I have been waiting a long time to tell you this story.';
// An empty or non-JSON reply means the backend is not running (it crashed or is still starting).
// Plain-language versions of errors people actually see.
const DESKTOP_APP=typeof window!=='undefined'&&Boolean(window.__TAURI__);
const ENGINE_DOWN=DESKTOP_APP?'Humperdinck\'s audio engine isn\'t responding. Quit and reopen Humperdinck. If it keeps happening, choose Humperdinck › Open Startup Log and send it to support.':'Humperdinck\'s backend is not responding. Check the start.cmd / start.sh window for an error, then restart it.';
export function friendlyError(message){
 const text=String(message||'').trim();
 if(/failed to fetch|networkerror|load failed|network request failed/i.test(text))return 'Can\'t reach Humperdinck\'s audio engine. If the app just started, wait a few seconds and try again.';
 // Python exception names ("RuntimeError: …") mean nothing to people.
 return text.replace(/^[A-Z][A-Za-z]*(?:Error|Exception): */,'')||'Something went wrong. Please try again.';
}
async function api(path,options){if(PUBLIC_STUDIO)throw Error('This feature requires the desktop application.');let r;try{r=await fetch('/api/'+path,options)}catch(e){throw Error(friendlyError(e.message))}let j;try{j=await r.json()}catch{throw Error(ENGINE_DOWN)}if(!r.ok){if(j.detail?.code==='PRO_REQUIRED')throw Error('Humperdinck Pro is required for this feature. Checkout is not available yet.');throw Error(errorText(j))}return j}
// FastAPI validation errors arrive as a list; show them as plain sentences.
function errorText(j){const d=j?.detail;if(typeof d==='string')return d;if(Array.isArray(d))return d.map(e=>{const where=(e.loc||[]).filter(p=>p!=='body').join(' ');return (where?where+': ':'')+(e.msg||'Invalid value')}).join('; ');return JSON.stringify(d||j)}
const json=(method,body)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const TABS=[['voices','Voice Library','fa-record-vinyl'],['creator','Voice Creator','fa-wand-magic-sparkles'],['narration','Narration Studio','fa-sliders'],['video','Video Studio','fa-film'],['effects','Sound Effects','fa-music'],['models','Models','fa-microchip']];
function App(){
 const {notify,confirm:askConfirm,input:askInput}=useNotifications();
 const [nativePackage,setNativePackage]=useState(null),[voicePacks,setVoicePacks]=useState(false);
 const [entitlementStatus,setEntitlementStatus]=useState({plan:'free',capabilities:{}});
 const hasPro=!PUBLIC_STUDIO&&entitlementStatus.plan==='pro';
 const [serverSettingsOpen,setServerSettingsOpen]=useState(false);
 const [accountOpen,setAccountOpen]=useState(false);
 const [account,setAccount]=useState(null);
 // The desktop window ignores new-window links: hand them to the system browser.
 useEffect(()=>{
  if(PUBLIC_STUDIO)return;
  const onClick=e=>{
   if(e.defaultPrevented||e.button!==0)return;
   const a=e.target.closest?.('a[target="_blank"]');
   if(!a||!/^https:/.test(a.href))return;
   e.preventDefault();
   fetch('/api/open-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:a.href})})
    .then(r=>{if(!r.ok)window.open(a.href,'_blank','noopener')}).catch(()=>window.open(a.href,'_blank','noopener'));
  };
  document.addEventListener('click',onClick);
  return ()=>document.removeEventListener('click',onClick);
 },[]);
 useEffect(()=>{if(PUBLIC_STUDIO)return;fetch('/api/account').then(r=>r.ok?r.json():null).then(a=>a&&setAccount(a)).catch(()=>{})},[]);
 const [setupOpen,setSetupOpen]=useState(false),[setupChecked,setSetupChecked]=useState(false);
 const [tab,setTab]=useState('voices'),[method,setMethod]=useState('controls'),[designed,setDesigned]=useState([]),[uploads,setUploads]=useState([]),[presets,setPresets]=useState([]),[characters,setCharacters]=useState([]),[charactersFor,setCharactersFor]=useState(null),[selected,setSelected]=useState(''),[detail,setDetail]=useState(null);
 const [name,setName]=useState('New voice'),[gender,setGender]=useState('masculine'),[description,setDescription]=useState(''),[settings,setSettings]=useState({...defaults}),[previewText,setPreviewText]=useState(starter),[candidates,setCandidates]=useState([]),[chosen,setChosen]=useState(''),[previewJob,setPreviewJob]=useState(null),[status,setStatus]=useState('');
 const [blocks,setBlocks]=useState([{id:1,text:'',voice_key:'',delay_after:0}]),[activePreview,setActivePreview]=useState(1),[speakerEditor,setSpeakerEditor]=useState(null),[voiceSearch,setVoiceSearch]=useState(''),[draggingSection,setDraggingSection]=useState(null),[playSectionRequest,setPlaySectionRequest]=useState(null),[sectionJob,setSectionJob]=useState(null),[sectionPreviewUrl,setSectionPreviewUrl]=useState(''),[sectionPlayingId,setSectionPlayingId]=useState(null),[audibleSectionId,setAudibleSectionId]=useState(null),[sectionPlayError,setSectionPlayError]=useState(null),[sectionAudio,setSectionAudio]=useState({}),[sectionMenu,setSectionMenu]=useState(null),[sectionPopover,setSectionPopover]=useState(null),[sectionSpeed,setSectionSpeed]=useState({}),[effectPicker,setEffectPicker]=useState(null),[ambiencePicker,setAmbiencePicker]=useState(false),[ambience,setAmbience]=useState(null),[format]=useState('mp3'),[downloadOpen,setDownloadOpen]=useState(false),[wholeMenuOpen,setWholeMenuOpen]=useState(false),[narrationJob,setNarrationJob]=useState(null),[wholeAudio,setWholeAudio]=useState(null),[wholeAudible,setWholeAudible]=useState(false),[video,setVideo]=useState(null),[videoJob,setVideoJob]=useState(null),[videoPreviewMode,setVideoPreviewMode]=useState('source'),[offset,setOffset]=useState(0),[mix,setMix]=useState(false);
 const [desk,setDeskState]=useState(()=>{try{return {...DEFAULT_DESK,...JSON.parse(localStorage.getItem('humperdinck-narration-desk')||'{}')}}catch{return DEFAULT_DESK}}),[deskOpen,setDeskOpen]=useState(()=>{try{return localStorage.getItem('humperdinck-narration-desk-open')==='open'}catch{return false}});
 const connectDesk=useDeskPreview(desk);
 function setDesk(next){setDeskState(next);try{localStorage.setItem('humperdinck-narration-desk',JSON.stringify(next))}catch{}}
 function toggleDesk(){setDeskOpen(o=>{try{localStorage.setItem('humperdinck-narration-desk-open',o?'closed':'open')}catch{};return !o})}
 const playSequence=useRef(0),hiddenAudio=useRef(null),pendingSignature=useRef(null),wholeAudioRef=useRef(null),wholeCompletedRef=useRef(null),downloadWrapRef=useRef(null),narrationBusyRef=useRef(false),blocksRef=useRef(blocks);
 // Polling callbacks must compare with the current script, not the render that started generation.
 blocksRef.current=blocks;
 const [savedReference,setSavedReference]=useState(false),[category,setCategory]=useState(''),[uploadSel,setUploadSel]=useState(''),[savedJobs,setSavedJobs]=useState([]);
 const [consentSubject,setConsentSubject]=useState(''),[consentAccepted,setConsentAccepted]=useState(false);
 const [consentSigner,setConsentSigner]=useState(''),[consentSpeaker,setConsentSpeaker]=useState(''),[consentDocument,setConsentDocument]=useState(null);
 useEffect(()=>{
  if(!status)return;
  const failed=/\b(error|failed|could not|not responding|unable|invalid|missing)\b/i.test(status);
  const succeeded=/\b(saved|approved|deleted|imported|uploaded|restored|ready|complete)\b/i.test(status);
  notify(status,failed?'error':succeeded?'success':'info');
 },[status,notify]);
 async function refresh(){try{if(PUBLIC_STUDIO){setDesigned([]);setUploads([]);setPresets(PUBLIC_VOICES);return}const [d,u,p,c]=await Promise.all([api('designed-voices'),api('voices'),api('preset-voices'),api('characters').catch(()=>[])]);setDesigned(d);setUploads(u);setPresets(p);setCharacters(c)}catch(e){setStatus(e.message)}}
 useEffect(()=>{refresh()},[]);
 // Publishing curated starter packs is an authoring tool, not a native end-user control.
 useEffect(()=>{if(!PUBLIC_STUDIO)api('health').then(h=>{setNativePackage(!!h.native_package);setVoicePacks(h.voice_packs!==false)}).catch(()=>{});},[]);
 useEffect(()=>{if(!PUBLIC_STUDIO)api('entitlements').then(setEntitlementStatus).catch(()=>{});},[]);
 // Pick up Built-In Humperdinck Voices that were added, changed or removed since last launch.
 useEffect(()=>{if(nativePackage===true)api('builtin-voices/check',{method:'POST'}).then(r=>{if(r.changed)refresh()}).catch(()=>{});},[nativePackage]);
 useEffect(()=>{if(nativePackage===true&&!setupChecked){setSetupChecked(true);api('setup').then(s=>{if(!s.finished)setSetupOpen(true)}).catch(()=>{});}},[nativePackage,setupChecked]);
 // Read new preset downloads when returning from Models to Narration Studio.
 useEffect(()=>{if(tab==='narration'||tab==='voices')refresh()},[tab]);
 useEffect(()=>{if(!previewJob||!['queued','running'].includes(previewJob.status))return;const timer=setInterval(async()=>{try{const j=await api('jobs/'+previewJob.job_id);setPreviewJob({...j,design_instruction:previewJob.design_instruction,design_model:previewJob.design_model});if(j.status==='complete'){setCandidates(old=>old.some(c=>c.job_id===j.job_id)?old:[...old,{...j,recipe:previewJob.recipe,design_instruction:previewJob.design_instruction,design_model:previewJob.design_model}]);setChosen(j.job_id);setStatus('Preview ready. Listen and select your favorite.')}else if(j.status==='failed')setStatus(j.message)}catch(e){setStatus(e.message)}},1000);return()=>clearInterval(timer)},[previewJob?.job_id,previewJob?.status]);
 useEffect(()=>{if(!narrationJob||!['queued','running'].includes(narrationJob.status))return;const timer=setInterval(async()=>{try{const j=await api('jobs/'+narrationJob.job_id);setNarrationJob(old=>({...j,signature:old?.signature}));if(j.status==='failed')setStatus('Narration failed: '+friendlyError(j.message))}catch(e){setStatus(e.message)}},1000);return()=>clearInterval(timer)},[narrationJob?.job_id,narrationJob?.status]);
 useEffect(()=>{if(!videoJob||!['queued','running'].includes(videoJob.status))return;const timer=setInterval(async()=>{try{const j=await api('jobs/'+videoJob.job_id);setVideoJob(j);if(j.status==='complete')setVideoPreviewMode('rendered');if(j.status==='failed')setStatus(j.message)}catch(e){setStatus(e.message)}},1000);return()=>clearInterval(timer)},[videoJob?.job_id,videoJob?.status]);
 function designTraits(){return method==='prompt'?{...defaults}:settings}
 function recipe(){return JSON.stringify({gender,description,settings:designTraits(),method})}
  function voicePrompt(){
    const base=description.trim();
    if(method==='prompt')return base;
    return `A ${gender}-presenting adult voice. ${base}`.trim();
  }
 function newVoice(){setConsentSubject('');setConsentAccepted(false);setConsentSigner('');setConsentSpeaker('');setConsentDocument(null);setSelected('');setUploadSel('');setDetail(null);setName('New voice');setDescription('');setGender('masculine');setSettings({...defaults});setCategory('');setCandidates([]);setChosen('');setSavedJobs([]);setSavedReference(false)}
 async function openVoice(id){try{const d=await api('designed-voices/'+id);const v=d.versions.find(v=>v.version===d.active_version);setSelected(id);setUploadSel('');setDetail(d);setName(d.name);setCategory(d.category||'');setDescription(v.description);setSettings({...defaults,...v.characteristics});setMethod('prompt');setCandidates([]);setChosen('');setSavedReference(!!v.approved_sample_id);setTab('creator');setStatus('')}catch(e){setStatus(e.message)}}
 async function upload(file,type){if(!file)return;try{if(type==='voices'&&(!consentAccepted||!['self','authorized'].includes(consentSubject)||consentSigner.trim().length<2||(consentSubject==='authorized'&&(!consentSpeaker.trim()||!consentDocument))))throw Error('Provide the speaker authorization and your electronic signature before importing this voice.');const form=new FormData();form.append('file',file);if(type==='voices'){form.append('consent_attestation','humperdinck-voice-consent-v2');form.append('consent_subject',consentSubject);form.append('consent_signer_name',consentSigner.trim());form.append('consent_speaker_name',consentSubject==='self'?consentSigner.trim():consentSpeaker.trim());if(consentSubject==='authorized'&&consentDocument)form.append('signed_authorization',consentDocument)}setStatus('Uploading...');const result=await api(type,{method:'POST',body:form});if(type==='voices'){setConsentAccepted(false);setConsentDocument(null);await refresh();setStatus('Voice imported. It is available for narration.')}else{setVideo(result);setVideoJob(null);setVideoPreviewMode('source');setStatus('Video uploaded. Set narration timing and render when ready.')}return result}catch(e){setStatus(e.message)}}
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
  const genderOf=t=>/\b(female|woman|girl|feminine)\b/i.test(t||'')?'female':/\b(male|man|boy|masculine)\b/i.test(t||'')?'male':'';
  const voiceOptions=[...presets.map(v=>{const [region,gender]=(v.accent||'').split(' · ');return {value:v.key,label:v.name+(duplicatedPresetNames.has(v.name)?' · '+region:''),accent:v.accent||'Built-in voice',kind:'builtin',region,gender:genderOf(gender),baseDescription:`A ${gender||''} ${region||''} voice`.replace(/\s+/g,' ')}}),
   ...uploads.filter(v=>['builtin-humperdinck','humperdinck-catalog'].includes(v.origin)).map(v=>({value:'upload:'+v.voice_id,label:v.filename,accent:v.origin==='builtin-humperdinck'?'Official Humperdinck voice':'From the voice gallery',kind:v.origin==='builtin-humperdinck'?'builtin':'gallery',locked:!hasPro&&v.origin!=='builtin-humperdinck',previewUrl:'/api/voices/'+v.voice_id+'/audio'})),
   ...designed.filter(v=>v.narration_sample_id).map(v=>({value:'design:'+v.id,label:v.name,accent:v.description||'Custom designed voice',kind:'designed',locked:!hasPro,gender:genderOf(v.description),baseDescription:v.description,previewUrl:'/api/designed-samples/'+(v.approved_sample_id||v.narration_sample_id)})),
   ...uploads.filter(v=>!['builtin-humperdinck','humperdinck-catalog'].includes(v.origin)).map(v=>({value:'upload:'+v.voice_id,label:v.filename,accent:v.category||'Recorded / uploaded voice',kind:'uploaded',locked:!hasPro&&v.origin!=='recorded',previewUrl:'/api/voices/'+v.voice_id+'/audio'}))];
  // Characters belong to an original voice; the picker lists them under it.
  voiceOptions.push(...characters.map(c=>{const parent=voiceOptions.find(v=>v.value===c.source_key);return parent&&{value:'character:'+c.id,label:parent.label+' · '+c.name,
   accent:[c.accent&&c.accent!=='Keep the original'?c.accent+' accent':'',c.direction].filter(Boolean).join(' · ')||'Character',kind:'character',parent:parent.value,locked:!hasPro&&(parent.locked||!c.performer||!parent.value.startsWith('preset:')),gender:parent.gender,region:parent.region,previewUrl:'/api/characters/'+c.id+'/sample.wav'}}).filter(Boolean));
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
 function attachSound(sectionId,sound,options){
  setBlocks(old=>old.map(b=>b.id===sectionId?{...b,effects:[...(b.effects||[]),{sound_id:sound.id,name:sound.name,position:options.position,volume:options.volume,fade_in:options.fade_in??0,fade_out:options.fade_out??0,loop:options.loop??false,ending:options.ending||'section',ducking:options.ducking??1}]}:b));
  setEffectPicker(null);
  notify('Added '+sound.name+' to narration','success');
 }
 function setCue(sectionId,index,field,value){
  setBlocks(old=>old.map(b=>b.id===sectionId?{...b,effects:(b.effects||[]).map((effect,i)=>i===index?{...effect,[field]:value}:effect)}:b));
 }
 function selectAmbience(sound){
  setAmbience({sound_id:sound.id,name:sound.name,volume:0.25,ducking:0.35,fade_in:0.5,fade_out:0.5});
  setAmbiencePicker(false);
  notify('Background ambience: '+sound.name,'success');
 }
 function changeAmbience(field,value){
  setAmbience(old=>old?{...old,[field]:value}:old);
 }
 function detachSound(sectionId,index){
  setBlocks(old=>old.map(b=>b.id===sectionId?{...b,effects:(b.effects||[]).filter((_,i)=>i!==index)}:b));
 }
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
  connectDesk(audio);
  audio.play().then(()=>setAudibleSectionId(id)).catch(()=>{setAudibleSectionId(null);setSectionPlayError({id,message:'Your browser blocked automatic playback. Click Play again to retry.'})});
 }
 function stopSection(){
  const audio=hiddenAudio.current;
  if(audio){audio.pause();audio.currentTime=0}
  setAudibleSectionId(null);
 }
 async function playSection(block,forceNew=false){
  if(audibleSectionId===block.id){stopSection();if(!forceNew)return}
  const clean=spokenText(block.text);
  if(!block.voice_key){openSpeaker(block.id);return}
  if(!clean){setSectionPlayError({id:block.id,message:'Enter text before generating audio.'});return}
  const signature=audioSignature(block);
  const existing=sectionAudio[block.id];
  if(!forceNew&&existing?.signature===signature){replaySection(existing.url,block.id);return}
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
     if(!audioResultIsCurrent(blocksRef.current,sectionId,signature)){
       setSectionPlayingId(null);
       setSectionPlayError({id:sectionId,message:'Section text or narrator changed while generating. Generate it again to hear the updated voice.'});
       return;
     }
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
  if(!downloadOpen&&!wholeMenuOpen)return;
  const dismiss=e=>{if(downloadWrapRef.current&&!downloadWrapRef.current.contains(e.target)){setDownloadOpen(false);setWholeMenuOpen(false)}};
  const onKey=e=>{if(e.key==='Escape'){setDownloadOpen(false);setWholeMenuOpen(false)}};
  document.addEventListener('pointerdown',dismiss);
  document.addEventListener('keydown',onKey);
  return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('keydown',onKey)};
 },[downloadOpen,wholeMenuOpen]);
 const fullNarrationSignature=wholeNarrationSignature(format,blocks,sectionSpeed,ambience,desk);
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
 async function clearNarration(){
  if(!await askConfirm('Clear the entire narration, including all sections and their generated audio? This cannot be undone.',{title:'Clear narration',confirmLabel:'Clear narration',danger:true}))return;
  stopWholeNarration();stopSection();
  setWholeMenuOpen(false);setDownloadOpen(false);
  const blank=makeSection();
  playSequence.current+=1;pendingSignature.current=null;wholeCompletedRef.current=null;
  if(wholeAudioRef.current){wholeAudioRef.current.pause();wholeAudioRef.current.removeAttribute('src');wholeAudioRef.current.load()}
  if(hiddenAudio.current){hiddenAudio.current.pause();hiddenAudio.current.removeAttribute('src');hiddenAudio.current.load()}
  setBlocks([blank]);setActivePreview(blank.id);setSectionAudio({});setSectionJob(null);setSectionPlayingId(null);setSectionPlayError(null);
  setWholeAudio(null);setWholeAudible(false);setNarrationJob(null);setAmbience(null);setEffectPicker(null);setSectionMenu(null);setSectionPopover(null);
  narrationBusyRef.current=false;
  setStatus('Narration cleared');
 }
 async function generateNarration(forceNew=false){
  if(wholeAudible){stopWholeNarration();if(!forceNew)return}
  if(narrationBusyRef.current||narrationJob&&['queued','running'].includes(narrationJob.status))return;
  if(!forceNew&&wholeAudio?.signature===fullNarrationSignature){playWholeNarration(wholeAudio.url);return}
  try{
   if(blocks.some(b=>!spokenText(b.text)||!b.voice_key))throw Error('Every section needs text and a narrator');
   stopWholeNarration();
   narrationBusyRef.current=true;
   setNarrationJob({status:'queued',message:'Preparing narration…',progress:0,signature:fullNarrationSignature});
   const j=await api('narrations',json('POST',{blocks:blocks.map(b=>({text:spokenText(b.text),voice_key:b.voice_key,delay_after:sectionDelay(b.delay_after),effects:(b.effects||[]).map(e=>({sound_id:e.sound_id,position:e.position,volume:e.volume,fade_in:e.fade_in||0,fade_out:e.fade_out||0,loop:e.loop||false,ending:e.ending||'section',ducking:e.ducking??1})),speed:Math.min(2,Math.max(.5,sectionSpeed[b.id]||1))})),format,desk,ambience:ambience?{sound_id:ambience.sound_id,volume:ambience.volume,ducking:ambience.ducking,fade_in:ambience.fade_in,fade_out:ambience.fade_out}:null}));
   wholeCompletedRef.current=null;
   setNarrationJob({...j,signature:fullNarrationSignature});
   setStatus('Generating narration...');
  }catch(e){setNarrationJob(old=>old?.job_id?old:null);setStatus(e.message)}
  finally{narrationBusyRef.current=false}
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

 async function cancelNarration(){if(!narrationJob?.job_id)return;try{const j=await api('narrations/'+narrationJob.job_id+'/cancel',{method:'POST'});setNarrationJob(old=>({...old,...j}))}catch(e){setStatus(e.message)}}
 async function renderVideo(){try{if(!video||narrationJob?.status!=='complete')throw Error('Upload a video and generate narration first');const j=await api('video-renders',json('POST',{video_id:video.video_id,narration_job_id:narrationJob.job_id,start_seconds:Number(offset),keep_original_audio:mix}));setVideoJob(j);setStatus('Rendering video...')}catch(e){setStatus(e.message)}}
 return <main className="app-shell">{PUBLIC_STUDIO&&<div className="public-app-banner">Browser Studio · Six built-in voices. Custom voice creation, uploads, multi-voice rendering and installs require the desktop app. <a href="/#download">Download info</a> <span className="public-build-version">Build {import.meta.env.VITE_BUILD_ID||'development'}</span></div>}<aside className="sidebar"><div className="brand"><img src={PUBLIC_STUDIO?"/studio/vintage-logo-dark.png?v=20261108b":"/vintage-logo-dark.png?v=20261108b"} alt="" className="brand-mark brand-mark-vintage"/><img src={PUBLIC_STUDIO?"/studio/vintage-logo-light.png?v=20261108b":"/vintage-logo-light.png?v=20261108b"} alt="" className="brand-mark brand-mark-vintage-light"/><img src={PUBLIC_STUDIO?"/studio/modern-logo-dark.png?v=20261108a":"/modern-logo-dark.png?v=20261108a"} alt="" className="brand-mark brand-mark-modern"/><img src={PUBLIC_STUDIO?"/studio/modern-logo-light.png?v=20261108a":"/modern-logo-light.png?v=20261108a"} alt="" className="brand-mark brand-mark-light"/><div><h1>Humperdinck</h1><small>A modern vintage recording studio{!PUBLIC_STUDIO&&<span className="app-version" title="Installed version"> · v{__APP_VERSION__}</span>}</small></div></div><nav aria-label="Studio">{TABS.map(([id,label,icon])=><button key={id} className={tab===id?'active':''} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)}><i className={'fa-solid '+icon}/> {label}</button>)}</nav><div className="sidebar-foot">{!PUBLIC_STUDIO&&<span className="tag" title={hasPro?(entitlementStatus.development_preview?"Development-only Pro preview":"Lifetime Pro · Signed offline license"):"Free edition"}>{hasPro?(entitlementStatus.development_preview?"PRO · DEV":"PRO"):"FREE"}</span>}<span className="local"><i className="fa-solid fa-circle"/> {PUBLIC_STUDIO?'Browser preview':'On air · local'}</span></div></aside><div className="workspace"><header className="topbar"><div className="header-actions"><ThemePicker/>{!PUBLIC_STUDIO&&<button type="button" className={'header-server-icon'+(account?.connected?' signed-in':'')} aria-label={account?.connected?'My account, signed in':'My account'} title={account?.connected?'Signed in as '+(account.user?.email||account.user?.display_name||'your account'):'My account · optional sign-in'} onClick={()=>setAccountOpen(true)}><i className={(account?.connected?'fa-solid':'fa-regular')+' fa-user'} aria-hidden="true"/></button>}{!PUBLIC_STUDIO&&<button type="button" className="header-server-icon" aria-label="Server settings" title="Local server settings" onClick={()=>setServerSettingsOpen(true)}><i className="fa-solid fa-server" aria-hidden="true"/></button>}{PUBLIC_STUDIO?<><a className="public-app-download" href="/#download">Get desktop app</a><a className="public-app-home" href="/">Website</a></>:<UpdateWidgetBoundary><Updates/></UpdateWidgetBoundary>}</div></header>
 {accountOpen&&!PUBLIC_STUDIO&&<AccountPanel onAccountChange={setAccount} onClose={()=>setAccountOpen(false)} onLicenseChange={()=>api("entitlements").then(setEntitlementStatus).catch(()=>{})}/>}
 {serverSettingsOpen&&<ServerSettings onClose={()=>setServerSettingsOpen(false)}/>}
 {setupOpen&&<FirstRunSetup onClose={()=>setSetupOpen(false)} onComplete={()=>{setSetupOpen(false);refresh()}}/>}

 {charactersFor&&voiceOptions.find(v=>v.value===charactersFor)&&<CharactersPanel api={api} askConfirm={askConfirm} source={voiceOptions.find(v=>v.value===charactersFor)} characters={characters}
  onChanged={refresh} onClose={()=>setCharactersFor(null)} onOpenModels={()=>{setCharactersFor(null);setTab('models')}}
  onUse={key=>{setCharactersFor(null);setBlocks(old=>assignSectionSpeaker(old,old[0]?.id,key));setTab('narration')}}/>}
 {tab==='voices'&&<section><div className="heading"><div><h2>Voice Library</h2><p>Browse built-in and saved voices. Select a built-in voice for narration or edit your own voices in Voice Creator.</p></div><button className="primary" onClick={()=>{newVoice();setMethod('controls');setTab('creator')}}><i className="fa-solid fa-plus"/> New voice</button></div>
 <VoiceGrid characterCounts={PUBLIC_STUDIO?null:Object.fromEntries(voiceOptions.filter(v=>v.kind!=='character').map(v=>[v.value,characters.filter(c=>c.source_key===v.value).length]))}
  onCharacters={PUBLIC_STUDIO?null:key=>setCharactersFor(key)} gallery={!PUBLIC_STUDIO&&voicePacks?<VoiceCatalog api={api} onInstalled={refresh} canDownload={hasPro}/>:null} previewDisabled={PUBLIC_STUDIO} onPreviewVoice={PUBLIC_STUDIO?(v)=>{setBlocks(old=>assignSectionSpeaker(old,old[0]?.id,v.key));setTab('narration')}:undefined} onCreate={()=>{newVoice();setMethod("controls");setTab("creator")}} items={[...presets.map(v=>({key:v.key,voiceKey:v.key,method:'preset',name:v.name,category:'Built-in · '+v.accent.split(' · ')[0],ready:true,status:'Ready for narration',summary:v.accent,traits:[v.accent],specs:[],onOpen:()=>{setBlocks(old=>assignSectionSpeaker(old,old[0]?.id,v.key));setTab('narration');}})),...designed.map(v=>({key:'d'+v.id,voiceKey:'design:'+v.id,method:v.method||'designed',name:v.name,category:'My Voices',selected:selected===v.id,ready:hasPro&&!!v.narration_sample_id,
  status:!hasPro?'Pro required':v.narration_sample_id?'Ready · v'+v.narration_version+' approved':'Draft · v'+v.active_version,summary:voiceSummary(v),
  meters:['pitch','rasp','pace','warmth'].map(k=>[traitLabels[k][0],v.characteristics?.[k]??50,traitLabels[k][1],traitLabels[k][2]]),
  specs:[['fa-solid fa-code-branch',v.version_count,'Versions'],['fa-solid fa-compact-disc',v.sample_count,'Preview takes'],['fa-regular fa-calendar',ago(v.updated_at),'Last changed']],
  previewUrl:v.preview_sample_id&&'/api/designed-samples/'+v.preview_sample_id,onOpen:()=>openVoice(v.id),onDelete:()=>deleteDesigned(v.id,v.name)})),
  ...uploads.map(v=>({key:'u'+v.voice_id,voiceKey:'upload:'+v.voice_id,method:v.origin||'uploaded',name:v.filename,category:v.origin==='builtin-humperdinck'?'Built-In Humperdinck Voices':v.origin==='humperdinck-catalog'?'Voice Gallery':'My Voices',selected:uploadSel===v.voice_id,ready:hasPro||v.origin==='builtin-humperdinck'||v.origin==='recorded',status:hasPro||v.origin==='builtin-humperdinck'||v.origin==='recorded'?'Ready for narration':'Pro required',
  summary:v.origin==='builtin-humperdinck'?'Official Humperdinck voice, prepared from an approved generated sample.':v.origin==='humperdinck-catalog'?'Humperdinck voice you downloaded from the voice gallery.':`${v.duration?v.duration+'-second ':''}${v.channels===2?'stereo':'mono'} reference clip used to clone this voice.${v.duration&&v.duration<10?' Longer clips (10–30 s) clone more reliably.':''}`,
  traits:[v.sample_rate&&(v.sample_rate/1000).toFixed(1)+' kHz',v.size_kb&&Math.round(v.size_kb/102.4)/10+' MB'].filter(Boolean),
  specs:[v.duration&&['fa-regular fa-clock',v.duration+'s','Length'],['fa-regular fa-calendar',ago(v.added_at),'Added']],
  previewUrl:'/api/voices/'+v.voice_id+'/audio',onOpen:()=>openUpload(v.voice_id),onDelete:v.origin==='builtin-humperdinck'?undefined:()=>deleteUpload(v.voice_id,v.filename)}))]}/>
 </section>}
  {tab==='creator'&&<section><div className="heading"><div><h2>Voice Creator</h2><p>{selected?'Edit, preview and approve a new version of your saved voice.':uploadSel?'Manage or refine this voice recording.':'Design, describe, record or upload a voice, then preview and save it to your library.'}</p></div><button onClick={()=>setTab('voices')}><i className="fa-solid fa-arrow-left"/> Back to Voice Library</button></div>
  <datalist id="categories">{[...new Set([...designed,...uploads].map(v=>v.category).filter(Boolean))].map(c=><option key={c} value={c}/>)}</datalist>
 <h3>{selected?'Edit designed voice':uploadSel?'Edit recorded voice':'Create a voice'}</h3><div className="method-grid">{[['upload','Upload Audio','Clone from a recording','fa-file-audio'],['record','Record with Mic','Record your own voice','fa-microphone'],['controls','Design with Sliders','Choose vocal characteristics','fa-sliders'],['prompt','Describe a Voice','Write what you want to hear','fa-feather-pointed']].map(([id,title,subtitle,icon])=><button disabled={PUBLIC_STUDIO&&(id==='upload'||id==='record')} title={PUBLIC_STUDIO&&(id==='upload'||id==='record')?'Download the desktop app to upload or record':''} className={'method '+(method===id?'active':'')} key={id} onClick={()=>{setMethod(id);setCandidates([]);setChosen('')}}><i className={'fa-solid method-icon '+icon}/><strong>{title}{!hasPro&&!PUBLIC_STUDIO&&id!=='record'?' · Pro':''}</strong><small>{subtitle}</small></button>)}</div>
 {!PUBLIC_STUDIO&&['upload','record'].includes(method)&&<div className="panel">
 <h3>Speaker authorization required</h3>
 <p className="hint">To make a voice that identifies a real person, you must be that speaker or possess the speaker's prior express, signed authorization. Your account's statement does not independently establish identity or validate someone else's signature.</p>
 <label>Whose voice is this?<select value={consentSubject} onChange={e=>{setConsentSubject(e.target.value);setConsentAccepted(false);setConsentDocument(null)}}><option value="">Choose an option</option><option value="self">My own voice</option><option value="authorized">Another speaker with signed authorization</option></select></label>
 {consentSubject&&<label>Your legal name (electronic signature)<input maxLength={120} autoComplete="name" value={consentSigner} onChange={e=>{setConsentSigner(e.target.value);setConsentAccepted(false)}} placeholder="Full name of person using Humperdinck"/></label>}
 {consentSubject==='authorized'&&<><label>Speaker's full name<input maxLength={120} value={consentSpeaker} onChange={e=>{setConsentSpeaker(e.target.value);setConsentAccepted(false)}} placeholder="Name as shown on the signed authorization"/></label>
 <label>Speaker-signed authorization (PDF, PNG or JPEG, maximum 5 MB)<input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" onChange={e=>{setConsentDocument(e.target.files?.[0]||null);setConsentAccepted(false)}}/></label>
 <p className="hint">A signed agreement must authorize AI voice reproduction, permitted uses and duration. The file stays privately on this computer; the app records its checksum and does not upload it to Humperdinck's website. A supplied document is not independently authenticated.</p></>}
 {consentSubject&&<label style={{display:'flex',gap:10,alignItems:'flex-start',marginTop:12}}><input type="checkbox" checked={consentAccepted} onChange={e=>setConsentAccepted(e.target.checked)}/><span>By checking this box and supplying my legal name, I intend to electronically sign my declaration that {consentSubject==='self'?'this recording is my own voice':'I possess the named speaker’s prior express signed authorization for this AI voice use'}. I accept the <a href="https://humperdinck.studio/voice-policy/" target="_blank" rel="noreferrer">AI Voice &amp; Consent Policy</a>.</span></label>}
 </div>}
 {!PUBLIC_STUDIO&&!hasPro&&method!=='record'&&!(uploadSel&&uploads.find(v=>v.voice_id===uploadSel)?.origin==='recorded')?<div className="panel"><h3><i className="fa-solid fa-lock" aria-hidden="true"/> Pro Voice Creator</h3><p>Custom Qwen voice design, cloning from uploaded audio files, and saving new AI voice identities are Pro features. Recording your own voice with the microphone is free. Your existing Narration Studio, Video Studio, sound effects, built-in voices, and exports remain free.</p><p className="hint">Checkout and permanent offline activation are being developed. You can continue creating narration with free built-in voices now.</p><button type="button" onClick={()=>setTab('narration')}>Open Narration Studio</button></div>:method==='record'?<div className="panel"><h3>Record with your microphone</h3><Recorder onSave={async f=>{const r=await upload(f,'voices');if(r){openUpload(r.voice_id);setStatus('Recording saved and ready for narration. Trim or clean it up below if needed.')}}}/></div>:method==='upload'?<div className="panel"><h3>Upload a voice reference</h3><DropZone accept=".wav,.mp3,.flac,.m4a,.ogg" onFile={f=>upload(f,'voices')} title="Drop a voice recording" hint="A clear recording you own or have permission to clone. WAV, MP3, FLAC, M4A or OGG, up to 30 MB. 10–30 seconds of clean speech works best."/>
  {(()=>{const u=uploads.find(v=>v.voice_id===uploadSel);if(!u)return null;return <div className="saved"><h3>{u.filename}</h3><div className="field-row"><div className="field"><label>Name</label><input aria-label="Name" defaultValue={u.filename} key={'n'+u.voice_id} onBlur={e=>e.target.value.trim()&&e.target.value!==u.filename&&updateUpload(u.voice_id,{name:e.target.value.trim()})}/></div><div className="field"><label>Category</label><input aria-label="Category" list="categories" defaultValue={u.category} key={'c'+u.voice_id} placeholder="e.g. Narrators" onBlur={e=>e.target.value!==u.category&&updateUpload(u.voice_id,{category:e.target.value})}/></div></div>
   <UploadedVoiceRefinement key={u.voice_id} voice={u} api={api} onSaved={refresh}/>
   <p className="hint">Trim to the cleanest speech and remove noise for a better clone.</p><AudioEditor src={'/api/voices/'+u.voice_id+'/audio'} source={'upload:'+u.voice_id} allowReplace saveLabel="Save as new voice" onSaved={async j=>{await refresh();if(j.voice_id!==u.voice_id)setUploadSel(j.voice_id);setStatus('Edited voice saved.')}}/></div>})()}</div>:<div className="panel"><div className="field-row"><div className="field"><label>Voice name</label><input aria-label="Voice name" value={name} onChange={e=>setName(e.target.value)}/></div><div className="field"><label>Category</label><input aria-label="Category" list="categories" value={category} onChange={e=>setCategory(e.target.value)} placeholder="e.g. Narrators, Villains"/></div></div>{method==='controls'&&<><label>Voice presentation</label><div className="toggle">{[['masculine','Male'],['feminine','Female']].map(([id,label])=><button key={id} className={gender===id?'active':''} onClick={()=>setGender(id)}>{label}</button>)}</div>
  <div className="slider-grid">{Object.keys(defaults).map(k=><div key={k}><label>{traitLabels[k][0]} <span>{settings[k]}</span></label><input type="range" min="0" max="100" value={settings[k]} onChange={e=>setSettings({...settings,[k]:+e.target.value})}/><div className="range-ends"><small>{traitLabels[k][1]}</small><small>{traitLabels[k][2]}</small></div></div>)}</div><div className="actions tight"><button onClick={()=>setSettings({...defaults})}>Reset sliders</button><button onClick={()=>setSettings(Object.fromEntries(Object.keys(defaults).map(k=>[k,Math.round(15+Math.random()*70)])))}>Randomize</button></div><p className="hint">Sliders are used only in Design with Sliders. Describe a Voice sends just your written prompt. Accents are not guaranteed; a real accent reference used with cloning is more reliable.</p></>}
 <label>{method==='prompt'?'Describe the voice':'Additional voice details (optional)'}</label><textarea className="short" value={description} onChange={e=>setDescription(e.target.value)} placeholder="Example: A relaxed, gravelly American narrator with a dry sense of humor."/>
 <div className="divider"/><h3>Preview before saving</h3><details className="panel"><summary>Inspect the exact voice instruction sent to Qwen</summary><p className="hint">The app combines your description and slider settings into this instruction. Text instructions guide the model but cannot force a particular voice.</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{previewJob?.design_instruction||voicePrompt()}</pre>{previewJob?.design_model&&<small>Preview model: {previewJob.design_model}</small>}</details><label>Sample text</label><textarea aria-label="Sample text" className="short" value={previewText} onChange={e=>setPreviewText(e.target.value)} maxLength={600}/><div className="actions voice-creator-icon-actions"><button className="primary voice-icon-action" type="button" aria-label="Generate preview" disabled={PUBLIC_STUDIO||busy(previewJob)||!previewText.trim()||!voicePrompt()} title={PUBLIC_STUDIO?'Available after downloading Humperdinck':'Generate preview'} onClick={preview}><i className={'fa-solid '+(busy(previewJob)?'fa-spinner fa-spin':'fa-wave-square')} aria-hidden="true"/></button><button className="voice-icon-action" type="button" aria-label="Save draft" onClick={()=>saveVoice(false)} disabled={PUBLIC_STUDIO||!voicePrompt()} title={PUBLIC_STUDIO?'Desktop app required':'Save draft'}><i className="fa-solid fa-floppy-disk" aria-hidden="true"/></button></div>{busy(previewJob)&&<div className="job">{previewJob.message}<progress max="100" value={previewJob.progress}/></div>}
 {candidates.filter(c=>c.recipe===recipe()).map((c,i)=><div className={'candidate '+(chosen===c.job_id?'chosen':'')} key={c.job_id}><label><input type="radio" checked={chosen===c.job_id} onChange={()=>setChosen(c.job_id)}/> Candidate {i+1}</label><Player src={c.download_url}/>{!selected&&(savedJobs.includes(c.job_id)?<small>Saved as a voice ✓</small>:<button onClick={()=>saveCandidateAsNew(c)}>Save as new voice</button>)}</div>)}
 {candidates.some(c=>c.recipe===recipe())&&<button className="primary" disabled={busy(previewJob)||savedJobs.includes(chosen)} onClick={()=>saveVoice(true)}>{selected?'Approve Selected & Save as New Version':'Approve Selected & Save Voice'}</button>}
 {detail&&<div className="saved"><h3>Saved voice history</h3>{detail.versions.map(v=><div className="version" key={v.version}><strong>Version {v.version}{v.version===detail.active_version?' · Current':''}{v.approved_sample_id?' · Approved':''}</strong><div className="actions tight">{v.version!==detail.active_version&&<button onClick={()=>restoreVersion(v.version)}>Restore this version</button>}{detail.versions.length>1&&<button className="danger" onClick={()=>deleteVersion(v.version)}>Delete version</button>}</div>{v.samples.map(s=><div key={s.id}><audio controls src={'/api/designed-samples/'+s.id}/><button disabled={v.approved_sample_id===s.id} onClick={()=>approveExisting(s.id,v.version)}>{v.approved_sample_id===s.id?'Approved voice':'Approve this sample'}</button></div>)}</div>)}<button className="danger" onClick={deleteVoice}>Delete Voice</button></div>}</div>}</section>}
 {tab==='narration'&&<section><div className="heading"><div><h2>Narration Studio</h2></div><span className="tag">Single or multi-voice</span></div>
 {!PUBLIC_STUDIO&&<PronunciationPanel api={api}/>}
 {voiceOptions.length===0&&<div className="notice">Install the Kokoro voices in Models for fast narration, or create and approve a custom voice in Voice Creator.</div>}

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
       {!PUBLIC_STUDIO&&<button type="button" className="icon-action" aria-label={'Add sound effect to section '+(i+1)} title="Add or mix sound with section" aria-expanded={effectPicker===b.id} onClick={()=>{setEffectPicker(old=>old===b.id?null:b.id);setSectionMenu(null);setSectionPopover(null)}}><i className="fa-solid fa-music" aria-hidden="true"/></button>}
       <button type="button" className="icon-action" aria-label={'Download section '+(i+1)} title="Download generated audio" onClick={()=>downloadSection(b)}><i className="fa-solid fa-download" aria-hidden="true"/></button>
       <div className="section-menu-wrap" data-section-floating-control>
        <button type="button" className="icon-action" aria-label={'More options for section '+(i+1)} title="More options" aria-expanded={sectionMenu===b.id} onClick={()=>{setSectionPopover(null);setSectionMenu(old=>old===b.id?null:b.id)}}><i className="fa-solid fa-ellipsis-vertical" aria-hidden="true"/></button>
        {sectionMenu===b.id&&<div className="section-options-menu">
         <button type="button" disabled={sectionPlayingId!==null||!b.voice_key||!spokenText(b.text)} onClick={()=>{setSectionMenu(null);playSection(b,true)}}><i className="fa-solid fa-arrows-rotate" aria-hidden="true"/> Regenerate section</button>
         <button type="button" onClick={()=>duplicateSection(i)}><i className="fa-regular fa-copy" aria-hidden="true"/> Duplicate section</button>
         {blocks.length>1&&<button type="button" className="section-options-remove" onClick={()=>{removeBlock(b.id);setSectionMenu(null)}}><i className="fa-solid fa-trash-can" aria-hidden="true"/> Delete section</button>}
        </div>}
       </div>
      </div>
    </div>
    {!!b.effects?.length&&<div className="section-sound-effects" aria-label={'Sound effects for section '+(i+1)}>{b.effects.map((effect,index)=><details key={effect.sound_id+'-'+index} className="section-sound-chip"><summary><i className="fa-solid fa-volume-high" aria-hidden="true"/><span>{effect.name} · {effect.position==='mix'?'Mixed with speech':effect.position} · {Math.round(effect.volume*100)}%</span><i className="fa-solid fa-chevron-down" aria-hidden="true"/></summary><div className="sound-cue-settings">
  <label>Placement<select value={effect.position} onChange={e=>setCue(b.id,index,'position',e.target.value)}><option value="mix">Mix with narration</option><option value="before">Before narration</option><option value="after">After narration</option></select></label>
    <label>Volume <input type="range" min="0" max="200" step="5" value={Math.round(effect.volume*100)} onChange={e=>setCue(b.id,index,'volume',Number(e.target.value)/100)}/></label>
  {effect.position==='mix'&&<>
   <label className="sound-option-checkbox"><input type="checkbox" checked={!!effect.loop} onChange={e=>setCue(b.id,index,'loop',e.target.checked)}/> Loop sound</label>
   <label>End sound<select value={effect.ending||'section'} onChange={e=>setCue(b.id,index,'ending',e.target.value)}>
    <option value="section">Cut off at end of section</option><option value="natural">Continue into next section until finished</option>
   </select></label>
   <label>Lower volume during speech <input type="range" min="0" max="90" step="5" value={Math.round((1-(effect.ducking??1))*100)} onChange={e=>setCue(b.id,index,'ducking',1-Number(e.target.value)/100)}/></label>
   {effect.loop&&effect.ending==='natural'&&<small>Looping continues through the end of the narration.</small>}
  </>}
  <label>Fade in <input type="number" min="0" max="10" step="0.1" value={effect.fade_in??0} onChange={e=>setCue(b.id,index,'fade_in',Math.max(0,Math.min(10,Number(e.target.value)||0)))}/> s</label>
  <label>Fade out <input type="number" min="0" max="10" step="0.1" value={effect.fade_out??0} onChange={e=>setCue(b.id,index,'fade_out',Math.max(0,Math.min(10,Number(e.target.value)||0)))}/> s</label>
  <button type="button" className="sound-cue-remove" onClick={()=>detachSound(b.id,index)}><i className="fa-solid fa-trash-can" aria-hidden="true"/> Remove</button>
 </div></details>)}</div>}
    {effectPicker===b.id&&<div className="section-sound-picker"><div className="section-sound-picker-head"><strong>Add a sound to Section {i+1}</strong><button type="button" onClick={()=>setEffectPicker(null)} aria-label="Close sound picker"><i className="fa-solid fa-xmark"/></button></div><SoundEffects api={api} compact sectionId={b.id} suggestText={b.text} onInsert={attachSound}/></div>}
    {sectionPlayError?.id===b.id&&<p className="section-play-error" role="alert">{sectionPlayError.message}</p>}
   </div>
  </div>
 </div>)}



 </div>
 {!PUBLIC_STUDIO&&<SoundDesk desk={desk} onChange={setDesk} open={deskOpen} onToggle={toggleDesk} note="Evens out and shapes every voice. Section previews play through it live; the full narration bakes it in when generated."/>}
 {speakerEditor!==null&&<NarratorPicker api={api} options={voiceOptions} publicStudio={PUBLIC_STUDIO}
  currentKey={blocks.find(b=>b.id===speakerEditor)?.voice_key||''} sectionNumber={blocks.findIndex(b=>b.id===speakerEditor)+1}
  usedKeys={[...new Set(blocks.map(b=>b.voice_key).filter(Boolean))]} onSelect={selectSpeaker} onClose={()=>setSpeakerEditor(null)}
  onVoiceCreated={refresh} onOpenModels={()=>{setSpeakerEditor(null);setTab('models')}} onOpenGallery={()=>{setSpeakerEditor(null);setTab('voices');setTimeout(()=>document.getElementById('voice-gallery')?.scrollIntoView({behavior:'smooth'}),150)}}/>}
 <audio ref={hiddenAudio} className="hidden-section-audio" aria-hidden="true" preload="auto" onPlay={e=>setAudibleSectionId(Number(e.currentTarget.dataset.sectionId)||null)} onPause={()=>setAudibleSectionId(null)} onEnded={()=>setAudibleSectionId(null)}/>
 {PUBLIC_STUDIO&&<BrowserKokoro voices={PUBLIC_VOICES.map(v=>[v.key,v.name,v.accent])} voice={blocks.find(b=>b.id===activePreview)?.voice_key||''} text={blocks.find(b=>b.id===activePreview)?.text||''} sectionNumber={Math.max(1,blocks.findIndex(b=>b.id===activePreview)+1)} compact playRequest={playSectionRequest} onPlaybackState={(id,state)=>{if(state==='ready'||state==='error'||state==='idle')setSectionPlayingId(old=>old===id?null:old);else if(state==='generating')setSectionPlayingId(id)}} onSectionAudio={(id,url)=>{if(id===null)return;const pending=pendingSignature.current;if(pending?.sectionId!==id)return;setSectionAudio(old=>({...old,[id]:{signature:pending.signature,url}}));replaySection(url,id)}} onSectionError={(id,message)=>setSectionPlayError({id,message})} />}
 {!PUBLIC_STUDIO&&<div className="actions narration-export-actions" ref={downloadWrapRef}><div className="narration-download-wrap">
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
 </div><div className="narration-whole-options" data-section-floating-control>
 <button type="button" className="narration-whole-menu-trigger" aria-label="More options for entire narration" title="Narration options" aria-expanded={wholeMenuOpen} aria-haspopup="true" onClick={()=>{setDownloadOpen(false);setWholeMenuOpen(open=>!open)}}><i className="fa-solid fa-ellipsis-vertical" aria-hidden="true"/></button>
 {wholeMenuOpen&&<div className="section-options-menu narration-whole-menu" role="menu">
  <button type="button" role="menuitem" disabled={!voiceOptions.length||['queued','running'].includes(narrationJob?.status)} onClick={()=>{setWholeMenuOpen(false);generateNarration(true)}}><i className="fa-solid fa-arrows-rotate" aria-hidden="true"/> Regenerate entire narration</button>
  <button type="button" role="menuitem" className="section-options-remove" disabled={narrationBusyRef.current||['queued','running'].includes(narrationJob?.status)} onClick={()=>clearNarration()}><i className="fa-solid fa-trash-can" aria-hidden="true"/> Clear narration</button>
 </div>}
 </div><button type="button" className="primary narration-full-play" aria-label={wholeAudible?'Stop narration':wholeAudio?.signature===fullNarrationSignature?'Play narration':'Generate narration'} title={wholeAudible?'Stop narration':wholeAudio?.signature===fullNarrationSignature?'Play narration':'Generate narration'} onClick={()=>generateNarration()} disabled={!voiceOptions.length||(['queued','running'].includes(narrationJob?.status))}><i className={'fa-solid '+(['queued','running'].includes(narrationJob?.status)?'fa-spinner fa-spin':wholeAudible?'fa-stop':'fa-play')} aria-hidden="true"/></button><audio ref={wholeAudioRef} className="hidden-section-audio" preload="auto" aria-hidden="true" onPlay={()=>setWholeAudible(true)} onPause={()=>setWholeAudible(false)} onEnded={()=>setWholeAudible(false)}/></div>}
 {PUBLIC_STUDIO&&<p className="hint">The browser generates one selected section at a time. To export a combined multi-speaker narration, use the desktop app.</p>}
 {narrationJob&&<div className="job"><p role={narrationJob.status==='failed'?'alert':undefined}>{narrationJob.status==='failed'?'Narration failed: '+friendlyError(narrationJob.message)+' Finished sections are kept for Try again.':narrationJob.status==='cancelled'?'Narration cancelled. Finished sections are kept, so Try again picks up where it stopped.':narrationJob.message}</p>{!['failed','cancelled'].includes(narrationJob.status)&&<progress max="100" value={narrationJob.progress}/>}{['queued','running'].includes(narrationJob.status)&&narrationJob.job_id&&<button type="button" className="danger" disabled={narrationJob.cancel_requested} onClick={cancelNarration}><i className="fa-solid fa-stop" aria-hidden="true"/> {narrationJob.cancel_requested?'Stopping…':'Cancel'}</button>}{['failed','cancelled'].includes(narrationJob.status)&&<button type="button" className="primary" onClick={()=>generateNarration(true)}><i className="fa-solid fa-rotate-right" aria-hidden="true"/> Try again</button>}{narrationJob.status==='complete'&&<><button onClick={()=>setTab('video')}>Add to Video →</button>
  <AudioEditor src={narrationJob.download_url.replace(/\.mp3$/,'.wav')} source={'output:'+narrationJob.job_id} saveLabel="Apply edits" onSaved={j=>{setNarrationJob({...j,job_id:j.download_url.split('/').pop().split('.')[0]});setStatus('Edited narration ready. Video Studio will use this version.')}}/></>}</div>}</section>}
 {tab==='video'&&<section className="video-studio">
 <div className="video-studio-heading"><div><h2>Video Studio</h2><p>Put narration on a video or a slideshow. Mark where each script starts, generate it, and export an MP4.</p></div></div>
 {PUBLIC_STUDIO?<div className="notice">Video Studio needs the desktop app.</div>
 :<VideoStudio api={api} voiceOptions={voiceOptions} narrationJob={narrationJob} notify={notify} refreshVoices={refresh}
   narrationText={blocks.map(b=>spokenText(b.text)).filter(Boolean).join(' ')} onOpenNarration={()=>setTab('narration')}/>}
 </section>}
 {tab==='effects'&&<section><SoundEffects api={api} disabled={PUBLIC_STUDIO}/></section>}
 {tab==='models'&&(PUBLIC_STUDIO?<section><h2>Models</h2><p>Download Humperdinck to install and manage local voice models.</p><div className="panel"><h3>Built-in voices</h3><p>The browser preview offers six voices. Other models and downloads are available in the desktop app.</p><button disabled>Install / Download · desktop only</button></div></section>:<Models onOpenSetup={()=>setSetupOpen(true)}/>)}
 </div></main>
}
// If the React bundle crashes, display a readable error rather than leaving
// the dark background and an apparently empty Windows native window.
class StartupErrorBoundary extends React.Component {
 constructor(props){super(props);this.state={error:null}}
 static getDerivedStateFromError(error){return {error}}
 componentDidCatch(error,info){console.error('Humperdinck UI startup failed',error,info)}
 render(){
  if(this.state.error)return <main role="alert"><h2>Humperdinck could not load its interface</h2><p>Try Open in Browser from the Humperdinck app menu. The desktop Startup Log also records WebView navigation and backend failures.</p><pre style={{whiteSpace:'pre-wrap'}}>{String(this.state.error.message||this.state.error)}</pre></main>;
  return this.props.children;
 }
}
function ClearStartupHelp(){useEffect(()=>{document.getElementById('startup-help')?.remove()},[]);return null}
createRoot(document.getElementById('root')).render(<StartupErrorBoundary><NotificationProvider><ClearStartupHelp/><App/></NotificationProvider></StartupErrorBoundary>);
