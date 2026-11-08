import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import NarratorPicker from './NarratorPicker.jsx';
import SoundDesk,{DEFAULT_DESK,useDeskPreview} from './SoundDesk.jsx';

// Video Studio: a picture track (videos and images), narration cues
// placed in time, and sound. Projects autosave; Export renders one MP4.
const ASPECTS=[['16:9','Landscape 16:9'],['9:16','Vertical 9:16'],['1:1','Square 1:1'],['4:5','Portrait 4:5']];
const uid=()=>Math.random().toString(36).slice(2,10);
const json=(method,body)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const clipLength=c=>c.type==='video'?Math.max(.1,(c.trim_end??c.duration??0)-(c.trim_start||0)):Math.max(.5,Number(c.duration)||4);
const cueSpeed=c=>Math.min(2,Math.max(.5,Number(c.speed)||1));
const cueLen=c=>(Number(c.length)||0)/cueSpeed(c);
const cueEnd=c=>(Number(c.start)||0)+cueLen(c);
const fmt=t=>{t=Math.max(0,t||0);const m=Math.floor(t/60),s=t-m*60;return m+':'+(s<10?'0':'')+s.toFixed(1)};
const cueSignature=c=>JSON.stringify([c.text,c.voice_key]);
function audioLength(url){return new Promise(resolve=>{const a=new Audio();a.preload='metadata';a.onloadedmetadata=()=>resolve(a.duration||0);a.onerror=()=>resolve(0);a.src=url})}
async function uploadFile(kind,file){
 const body=new FormData();body.append('file',file);
 const r=await fetch('/api/'+kind,{method:'POST',body});const j=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(j.detail||'Upload failed');return j;
}

export default function VideoStudio({api,voiceOptions,narrationJob,narrationText,refreshVoices,onOpenNarration,notify}){
 const [projects,setProjects]=useState([]),[project,setProject]=useState(null),[selected,setSelected]=useState(null);
 const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[zoom,setZoom]=useState(40);
 const [busy,setBusy]=useState(''),[render,setRender]=useState(null),[cueJobs,setCueJobs]=useState({}),[pickerFor,setPickerFor]=useState(null);
 const [music,setMusic]=useState([]),[captionsOn,setCaptionsOn]=useState(true);
 const videoEl=useRef(null),cueAudio=useRef({}),clock=useRef({t:0,last:0}),saveTimer=useRef(null),fileInput=useRef(null),pendingKind=useRef('');
 const timelineRef=useRef(null);
 const [deskOpen,setDeskOpen]=useState(()=>{try{return localStorage.getItem('humperdinck-video-desk')==='open'}catch{return false}});
 const connectDesk=useDeskPreview(project?.desk||DEFAULT_DESK);
 function toggleDesk(){setDeskOpen(o=>{try{localStorage.setItem('humperdinck-video-desk',o?'closed':'open')}catch{};return !o})}

 // ---- projects -------------------------------------------------------------
 const loadProjects=useCallback(async()=>{const list=await api('video-projects');setProjects(list);return list},[api]);
 useEffect(()=>{(async()=>{try{
  const list=await loadProjects();
  let last=null;try{last=localStorage.getItem('humperdinck-video-project')}catch{}
  const id=list.find(p=>p.id===last)?.id||list[0]?.id;
  if(id)setProject(await api('video-projects/'+id));
  api('sound-effects').then(setMusic).catch(()=>{});
 }catch(e){notify?.(e.message,'error')}})()},[]);
 useEffect(()=>{if(project)try{localStorage.setItem('humperdinck-video-project',project.id)}catch{}},[project?.id]);
 function update(change){
  setProject(old=>{const next=typeof change==='function'?change(old):{...old,...change};
   clearTimeout(saveTimer.current);
   saveTimer.current=setTimeout(()=>api('video-projects/'+next.id,json('PUT',next)).then(loadProjects).catch(e=>notify?.(e.message,'error')),500);
   return next});
 }
 async function newProject(){const p=await api('video-projects',json('POST',{name:'Untitled video'}));setProject(p);setSelected(null);setTime(0);setRender(null);loadProjects()}
 async function openProject(id){setPlaying(false);setProject(await api('video-projects/'+id));setSelected(null);setTime(0);setRender(null)}
 async function removeProject(){
  if(!project||!window.confirm(`Delete "${project.name}"? Your uploaded media stays in the library.`))return;
  await api('video-projects/'+project.id,{method:'DELETE'});const list=await loadProjects();
  if(list[0])openProject(list[0].id);else setProject(null);
 }

 // ---- derived timeline -----------------------------------------------------
 const clips=project?.clips||[],cues=project?.cues||[];
 const layout=useMemo(()=>{let at=0;return clips.map(c=>{const start=at;at+=clipLength(c);return {clip:c,start,end:at}})},[clips]);
 const pictureLength=layout.length?layout[layout.length-1].end:0;
 const length=Math.max(pictureLength,...cues.filter(c=>c.audio).map(cueEnd),0);
 const current=layout.find(l=>time>=l.start&&time<l.end)||null;
 const activeCue=cues.find(c=>c.audio&&time>=c.start&&time<cueEnd(c));
 const speaking=project?.sound.duck&&cues.some(c=>c.audio&&time>=c.start-.15&&time<cueEnd(c)+.25);

 // ---- media ----------------------------------------------------------------
 async function addFiles(files,kind){
  if(!project||!files.length)return;
  setBusy('Uploading…');
  try{
   const added=[];
   for(const file of files){
    const isVideo=/\.(mp4|mov|mkv|webm)$/i.test(file.name),isImage=/\.(png|jpe?g|webp)$/i.test(file.name);
    if(kind==='video'&&!isVideo||kind==='image'&&!isImage||!isVideo&&!isImage){notify?.(`${file.name} isn't a supported ${kind||'video or image'} file`,'error');continue}
    if(isVideo){const v=await uploadFile('videos',file);const info=await api('videos/'+v.video_id+'/info');
     added.push({id:uid(),type:'video',source_id:v.video_id,name:file.name,duration:info.duration,trim_start:0,trim_end:info.duration,has_audio:info.has_audio,volume:1})}
    else{const im=await uploadFile('images',file);added.push({id:uid(),type:'image',source_id:im.image_id,name:file.name,duration:4,motion:true})}
   }
   if(added.length){update(p=>({...p,clips:[...p.clips,...added]}));setSelected({kind:'clip',id:added[0].id})}
  }catch(e){notify?.(e.message,'error')}finally{setBusy('')}
 }
 function pickFiles(kind){pendingKind.current=kind;fileInput.current.accept=kind==='video'?'.mp4,.mov,.mkv,.webm':kind==='image'?'.png,.jpg,.jpeg,.webp':'.mp4,.mov,.mkv,.webm,.png,.jpg,.jpeg,.webp';fileInput.current.click()}
 const setClip=(id,change)=>update(p=>({...p,clips:p.clips.map(c=>c.id===id?{...c,...change}:c)}));
 const moveClip=(id,step)=>update(p=>{const list=[...p.clips],i=list.findIndex(c=>c.id===id),j=i+step;if(j<0||j>=list.length)return p;[list[i],list[j]]=[list[j],list[i]];return {...p,clips:list}});
 const removeClip=id=>{update(p=>({...p,clips:p.clips.filter(c=>c.id!==id)}));setSelected(null)};

 // ---- narration cues --------------------------------------------------------
 function addCue(at=time){
  const previous=[...cues].filter(c=>c.start<=at).sort((a,b)=>b.start-a.start)[0];
  const cue={id:uid(),start:Math.round(at*10)/10,text:'',voice_key:previous?.voice_key||'',audio:null,length:0};
  update(p=>({...p,cues:[...p.cues,cue].sort((a,b)=>a.start-b.start)}));setSelected({kind:'cue',id:cue.id});
 }
 const setCue=(id,change)=>update(p=>({...p,cues:p.cues.map(c=>c.id===id?{...c,...change}:c).sort((a,b)=>a.start-b.start)}));
 const removeCue=id=>{update(p=>({...p,cues:p.cues.filter(c=>c.id!==id)}));setSelected(null)};
 async function generateCue(cue){
  if(!cue.text.trim()){notify?.('Write the script for this cue first','error');return}
  if(!cue.voice_key){setPickerFor(cue.id);return}
  setCueJobs(o=>({...o,[cue.id]:{status:'queued',message:'Starting…'}}));
  try{
   let j=await api('narrations',json('POST',{blocks:[{text:cue.text,voice_key:cue.voice_key,delay_after:0}],format:'wav'}));
   while(!['complete','failed'].includes(j.status)){setCueJobs(o=>({...o,[cue.id]:j}));await new Promise(r=>setTimeout(r,800));j=await api('jobs/'+j.job_id)}
   if(j.status==='failed')throw Error(j.message);
   const seconds=await audioLength('/api/outputs/'+j.job_id+'.wav');
   setCue(cue.id,{audio:j.job_id,length:Math.round(seconds*100)/100,signature:cueSignature(cue)});
   setCueJobs(o=>({...o,[cue.id]:null}));
  }catch(e){setCueJobs(o=>({...o,[cue.id]:{status:'failed',message:e.message}}))}
 }
 async function importNarration(){
  if(narrationJob?.status!=='complete')return;
  const seconds=await audioLength('/api/outputs/'+narrationJob.job_id+'.wav');
  const cue={id:uid(),start:0,text:narrationText||'',voice_key:'',audio:narrationJob.job_id,length:Math.round(seconds*100)/100,imported:true};
  update(p=>({...p,cues:[...p.cues,cue].sort((a,b)=>a.start-b.start)}));setSelected({kind:'cue',id:cue.id});
 }

 // ---- playback --------------------------------------------------------------
 useEffect(()=>{
  if(!playing)return;
  let frame;clock.current.last=performance.now();
  const tick=now=>{const t=clock.current.t+(now-clock.current.last)/1000;clock.current.last=now;
   if(t>=length){clock.current.t=length;setTime(length);setPlaying(false);return}
   clock.current.t=t;setTime(t);frame=requestAnimationFrame(tick)};
  frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[playing,length]);
 useEffect(()=>{clock.current.t=time},[playing]);
 function seek(t){t=Math.max(0,Math.min(length,t));clock.current.t=t;setTime(t)}
 // Keep the visible video and the cue audio in step with the clock.
 useEffect(()=>{
  const v=videoEl.current;
  if(v&&current?.clip.type==='video'){
   const want=(current.clip.trim_start||0)+(time-current.start);
   if(Math.abs(v.currentTime-want)>(playing?.35:.05))v.currentTime=want;
   const keep=project.sound.keep_original&&current.clip.has_audio;
   v.volume=keep?Math.min(1,(current.clip.volume??1)*project.sound.original_volume*(speaking?project.sound.duck_volume:1)):0;
   if(playing&&v.paused)v.play().catch(()=>{});if(!playing&&!v.paused)v.pause();
  }
  for(const cue of cues){const a=cueAudio.current[cue.id];if(!a)continue;
   const inside=cue.audio&&time>=cue.start&&time<cueEnd(cue);
   a.playbackRate=cueSpeed(cue);a.preservesPitch=true;
   if(playing&&inside){connectDesk(a,cue.gain||0);const want=(time-cue.start)*cueSpeed(cue);if(Math.abs(a.currentTime-want)>.3)a.currentTime=want;if(a.paused)a.play().catch(()=>{})}
   else if(!a.paused)a.pause();
  }
 });
 useEffect(()=>{const onKey=e=>{if(e.target.closest('input,textarea,select,[contenteditable]'))return;
  if(e.code==='Space'&&project){e.preventDefault();setPlaying(p=>!p)}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[project]);

 // ---- export ----------------------------------------------------------------
 async function exportVideo(){
  setPlaying(false);
  const missing=cues.filter(c=>!c.audio||(!c.imported&&c.signature!==cueSignature(c)));
  if(missing.length&&!window.confirm(`${missing.length} cue${missing.length>1?'s are':' is'} not generated or out of date and will be ${missing.some(c=>!c.audio)?'left out':'used as last generated'}. Export anyway?`))return;
  clearTimeout(saveTimer.current);await api('video-projects/'+project.id,json('PUT',project));
  try{let j=await api('video-projects/'+project.id+'/render',{method:'POST'});setRender(j);
   while(!['complete','failed'].includes(j.status)){await new Promise(r=>setTimeout(r,1000));j=await api('jobs/'+j.job_id);setRender(j)}
  }catch(e){setRender({status:'failed',message:e.message})}
 }

 // ---- rendering -------------------------------------------------------------
 if(!project)return <div className="vs-empty-start panel"><h3>Make your first video</h3><p>Combine a video or pictures with narration, then export an MP4.</p><button className="primary" onClick={newProject}><i className="fa-solid fa-plus"/> New video project</button></div>;
 const [aw,ah]=project.aspect.split(':').map(Number);
 const sel=selected?.kind==='clip'?clips.find(c=>c.id===selected.id):selected?.kind==='cue'?cues.find(c=>c.id===selected.id):null;
 const empty=!clips.length&&!cues.length;
 const pxPerSec=zoom,trackWidth=Math.max(600,(length+8)*pxPerSec);
 const captionText=captionsOn&&activeCue?(()=>{const parts=activeCue.text.replace(/\[[^\]]*\]/g,'').split(/(?<=[.!?])\s+/).filter(Boolean);if(!parts.length)return '';const words=parts.map(p=>p.split(/\s+/).length),total=words.reduce((a,b)=>a+b,0);let at=activeCue.start;for(let i=0;i<parts.length;i++){at+=cueLen(activeCue)*words[i]/total;if(time<at)return parts[i]}return parts[parts.length-1]})():'';
 const voiceLabel=key=>voiceOptions.find(v=>v.value===key)?.label;
 const nextCue=sel&&selected.kind==='cue'?cues.find(c=>c.start>sel.start&&c.id!==sel.id):null;
 const overlaps=sel&&selected.kind==='cue'&&nextCue&&sel.audio&&cueEnd(sel)>nextCue.start;

 return <div className="vs">
  <input ref={fileInput} type="file" multiple hidden onChange={e=>{addFiles([...e.target.files],pendingKind.current);e.target.value=''}}/>
  <div className="vs-bar">
   <i className="fa-solid fa-film vs-bar-icon" aria-hidden="true"/>
   <input className="vs-name" aria-label="Project name" value={project.name} maxLength={120} onChange={e=>update({name:e.target.value})}/>
   <select className="vs-projects" aria-label="Open another project" value={project.id} onChange={e=>openProject(e.target.value)}>{projects.map(p=><option key={p.id} value={p.id}>{p.name||'Untitled video'}</option>)}</select>
   <button type="button" className="icon-action" title="New project" aria-label="New video project" onClick={newProject}><i className="fa-solid fa-plus"/></button>
   <button type="button" className="icon-action" title="Delete project" aria-label="Delete this project" onClick={removeProject}><i className="fa-solid fa-trash-can"/></button>
   <span className="vs-bar-spacer"/>
   <select aria-label="Shape" value={project.aspect} onChange={e=>update({aspect:e.target.value})}>{ASPECTS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
   <span className="vs-length"><i className="fa-regular fa-clock" aria-hidden="true"/> {fmt(length)}</span>
   <button type="button" className="primary vs-export" disabled={!length||['queued','running'].includes(render?.status)} onClick={exportVideo}><i className={'fa-solid '+(['queued','running'].includes(render?.status)?'fa-spinner fa-spin':'fa-clapperboard')}/> Export MP4</button>
  </div>
  {render&&<div className={'vs-render '+render.status}>
   {['queued','running'].includes(render.status)&&<><span>{render.message}</span><progress max="100" value={render.progress||0}/></>}
   {render.status==='complete'&&<><i className="fa-solid fa-circle-check"/><span>Your video is ready.</span><a className="button primary" href={render.download_url} download={(project.name||'video')+'.mp4'}><i className="fa-solid fa-download"/> Download MP4</a><a className="button" href={'/api/video-projects/'+project.id+'/captions.srt'}><i className="fa-solid fa-closed-captioning"/> Captions (.srt)</a><button type="button" className="icon-action" aria-label="Dismiss" onClick={()=>setRender(null)}><i className="fa-solid fa-xmark"/></button></>}
   {render.status==='failed'&&<><i className="fa-solid fa-triangle-exclamation"/><span>{render.message}</span><button type="button" className="icon-action" aria-label="Dismiss" onClick={()=>setRender(null)}><i className="fa-solid fa-xmark"/></button></>}
  </div>}

  {empty?<div className="vs-starts">
   <button type="button" className="vs-start" onClick={()=>pickFiles('video')}><i className="fa-solid fa-video"/><strong>Narrate a video</strong><small>Upload a video, mark where narration starts, and add a script for each moment.</small></button>
   <button type="button" className="vs-start" onClick={()=>pickFiles('image')}><i className="fa-solid fa-images"/><strong>Make a slideshow</strong><small>Add photos or slides. They gently zoom while your narration plays.</small></button>
   <button type="button" className="vs-start" disabled={narrationJob?.status!=='complete'} onClick={importNarration}><i className="fa-solid fa-microphone-lines"/><strong>Start from my narration</strong><small>{narrationJob?.status==='complete'?'Use the narration you made in Narration Studio, then add pictures or video.':'Generate a narration in Narration Studio first.'}</small></button>
  </div>:<>
  <div className="vs-main">
   <div className="vs-stage panel">
    <div className="vs-screen" style={{aspectRatio:aw+' / '+ah}}>
     {current?.clip.type==='video'&&<video ref={videoEl} key={current.clip.source_id} src={'/api/videos/'+current.clip.source_id} preload="auto" playsInline muted={!project.sound.keep_original}/>}
     {current?.clip.type==='image'&&<img alt="" src={'/api/images/'+current.clip.source_id} style={{transform:current.clip.motion?`scale(${1+.08*(time-current.start)/clipLength(current.clip)})`:'none'}}/>}
     {current?.clip.type==='color'&&<div className="vs-color" style={{background:current.clip.color}}/>}
     {!current&&<div className="vs-color vs-hold"><span>{time>=pictureLength&&cues.length?'Narration continues on a dark card':'Add pictures to the timeline'}</span></div>}
     {captionText&&<div className="vs-caption">{captionText}</div>}
     {busy&&<div className="vs-busy"><i className="fa-solid fa-spinner fa-spin"/> {busy}</div>}
    </div>
    <div className="vs-transport">
     <button type="button" className="vs-play" aria-label={playing?'Pause':'Play'} title="Play / pause (Space)" onClick={()=>{if(time>=length)seek(0);setPlaying(p=>!p)}}><i className={'fa-solid '+(playing?'fa-pause':'fa-play')}/></button>
     <span className="vs-time">{fmt(time)} <small>/ {fmt(length)}</small></span>
     <input type="range" min="0" max={length||1} step="0.05" value={time} aria-label="Playhead" onChange={e=>{setPlaying(false);seek(Number(e.target.value))}}/>
     <label className="check vs-cc"><input type="checkbox" checked={captionsOn} onChange={e=>setCaptionsOn(e.target.checked)}/> Captions</label>
     <button type="button" className="primary vs-mark" onClick={()=>{setPlaying(false);addCue(time)}}><i className="fa-solid fa-location-dot"/> Add narration here</button>
    </div>
   </div>

   <div className="vs-inspector panel">
    {!sel&&<div className="vs-inspector-empty">
     <h4>Sound</h4>
     <label className="check"><input type="checkbox" checked={project.sound.keep_original} onChange={e=>update(p=>({...p,sound:{...p.sound,keep_original:e.target.checked}}))}/> Keep the video's own sound</label>
     <label className="check"><input type="checkbox" checked={project.sound.duck} onChange={e=>update(p=>({...p,sound:{...p.sound,duck:e.target.checked}}))}/> Lower it while narration plays</label>
     <label>Background music<select value={project.sound.music_id||''} onChange={e=>update(p=>({...p,sound:{...p.sound,music_id:e.target.value||null}}))}><option value="">None</option>{music.map(m=><option key={m.id} value={m.id}>{m.name}{m.category?' · '+m.category:''}</option>)}</select></label>
     {project.sound.music_id&&<label>Music volume<input type="range" min="0.02" max="0.6" step="0.01" value={project.sound.music_volume} onChange={e=>update(p=>({...p,sound:{...p.sound,music_volume:Number(e.target.value)}}))}/></label>}
     <label className="check"><input type="checkbox" checked={project.sound.fade} onChange={e=>update(p=>({...p,sound:{...p.sound,fade:e.target.checked}}))}/> Fade in and out</label>
     <p className="hint">Select a clip or a narration cue on the timeline to edit it. Music comes from your Sound Effects library.</p>
    </div>}
    {sel&&selected.kind==='cue'&&<div className="vs-cue-editor">
     <div className="vs-inspector-head"><h4><i className="fa-solid fa-microphone-lines"/> Narration cue</h4><button type="button" className="icon-action" aria-label="Close" onClick={()=>setSelected(null)}><i className="fa-solid fa-xmark"/></button></div>
     <div className="vs-row"><label>Starts at<input type="number" min="0" step="0.1" value={sel.start} onChange={e=>setCue(sel.id,{start:Math.max(0,Number(e.target.value)||0)})}/></label>
      <button type="button" onClick={()=>setCue(sel.id,{start:Math.round(time*10)/10})} title="Move this cue to the playhead"><i className="fa-solid fa-location-dot"/> Use playhead ({fmt(time)})</button></div>
     {sel.imported?<p className="hint"><i className="fa-solid fa-link"/> From Narration Studio · {fmt(sel.length)}. <button type="button" className="link" onClick={onOpenNarration}>Edit it there</button>, then add it again.</p>:<>
      <button type="button" className="vs-voice" onClick={()=>setPickerFor(sel.id)}><i className="fa-solid fa-user"/><span>{voiceLabel(sel.voice_key)||'Choose a voice'}</span><i className="fa-solid fa-chevron-down"/></button>
      <textarea rows={6} placeholder="Write what the narrator says at this moment…" value={sel.text} onChange={e=>setCue(sel.id,{text:e.target.value})}/>
      <div className="vs-row">
       <button type="button" className="primary" disabled={['queued','running'].includes(cueJobs[sel.id]?.status)} onClick={()=>generateCue(sel)}><i className={'fa-solid '+(['queued','running'].includes(cueJobs[sel.id]?.status)?'fa-spinner fa-spin':'fa-wand-magic-sparkles')}/> {sel.audio?'Regenerate':'Generate'}</button>
       {sel.audio&&<button type="button" onClick={()=>{seek(sel.start);setPlaying(true)}}><i className="fa-solid fa-play"/> Play from cue</button>}
      </div>
      {cueJobs[sel.id]&&<small className={cueJobs[sel.id].status==='failed'?'vs-warn':'hint'}>{cueJobs[sel.id].message}</small>}
      {sel.audio&&sel.signature!==cueSignature(sel)&&<small className="vs-warn">The script or voice changed. Regenerate to hear it.</small>}
     </>}
     {sel.audio&&<div className="vs-cue-sound">
      <label>Loudness <small>{(sel.gain||0)>0?'+':''}{sel.gain||0} dB</small><input type="range" min="-12" max="12" step="1" value={sel.gain||0} onChange={e=>setCue(sel.id,{gain:Number(e.target.value)})} onDoubleClick={()=>setCue(sel.id,{gain:0})}/></label>
      <label>Pace <small>{cueSpeed(sel).toFixed(2)}×</small><input type="range" min="0.8" max="1.25" step="0.01" value={cueSpeed(sel)} onChange={e=>setCue(sel.id,{speed:Number(e.target.value)})} onDoubleClick={()=>setCue(sel.id,{speed:1})}/></label>
      <small className="hint">Fix one voice that sounds too loud, quiet, slow or rushed. Double-click a slider to reset it.</small>
     </div>}
     {sel.audio&&<small className="hint">{fmt(cueLen(sel))} long · ends at {fmt(cueEnd(sel))}</small>}
     {overlaps&&<small className="vs-warn"><i className="fa-solid fa-triangle-exclamation"/> Runs {(cueEnd(sel)-nextCue.start).toFixed(1)} s into the next cue. Move one of them or shorten the script.</small>}
     <button type="button" className="vs-remove" onClick={()=>removeCue(sel.id)}><i className="fa-solid fa-trash-can"/> Remove cue</button>
    </div>}
    {sel&&selected.kind==='clip'&&<div className="vs-clip-editor">
     <div className="vs-inspector-head"><h4><i className={'fa-solid '+(sel.type==='video'?'fa-video':sel.type==='image'?'fa-image':'fa-square')}/> {sel.name}</h4><button type="button" className="icon-action" aria-label="Close" onClick={()=>setSelected(null)}><i className="fa-solid fa-xmark"/></button></div>
     {sel.type==='video'?<>
      <div className="vs-row"><label>Start at<input type="number" min="0" max={sel.trim_end} step="0.1" value={sel.trim_start} onChange={e=>setClip(sel.id,{trim_start:Math.max(0,Math.min(sel.trim_end-.1,Number(e.target.value)||0))})}/></label>
       <label>End at<input type="number" min={sel.trim_start} max={sel.duration} step="0.1" value={sel.trim_end} onChange={e=>setClip(sel.id,{trim_end:Math.min(sel.duration,Math.max(sel.trim_start+.1,Number(e.target.value)||0))})}/></label></div>
      <small className="hint">Uses {fmt(clipLength(sel))} of {fmt(sel.duration)}.</small>
      {sel.has_audio&&<label>Clip sound<input type="range" min="0" max="1.5" step="0.05" value={sel.volume??1} onChange={e=>setClip(sel.id,{volume:Number(e.target.value)})}/></label>}
     </>:<label>Show for (seconds)<input type="number" min="0.5" max="120" step="0.5" value={sel.duration} onChange={e=>setClip(sel.id,{duration:Math.max(.5,Number(e.target.value)||.5)})}/></label>}
     {sel.type==='image'&&<label className="check"><input type="checkbox" checked={!!sel.motion} onChange={e=>setClip(sel.id,{motion:e.target.checked})}/> Slow zoom</label>}
     {sel.type==='color'&&<label>Colour<input type="color" value={sel.color} onChange={e=>setClip(sel.id,{color:e.target.value})}/></label>}
     <div className="vs-row"><button type="button" onClick={()=>moveClip(sel.id,-1)}><i className="fa-solid fa-arrow-left"/> Earlier</button><button type="button" onClick={()=>moveClip(sel.id,1)}>Later <i className="fa-solid fa-arrow-right"/></button></div>
     <button type="button" className="vs-remove" onClick={()=>removeClip(sel.id)}><i className="fa-solid fa-trash-can"/> Remove from timeline</button>
    </div>}
   </div>
  </div>

  <SoundDesk desk={project.desk||DEFAULT_DESK} open={deskOpen} onToggle={toggleDesk} onChange={desk=>update(p=>({...p,desk}))}
   note="Applies to every narration cue. You hear it live here; Level match is applied when you export."/>
  <div className="vs-timeline panel" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addFiles([...e.dataTransfer.files])}}>
   <div className="vs-timeline-tools">
    <button type="button" onClick={()=>pickFiles('video')}><i className="fa-solid fa-video"/> Video</button>
    <button type="button" onClick={()=>pickFiles('image')}><i className="fa-solid fa-images"/> Images</button>
    <button type="button" onClick={()=>addCue(time)}><i className="fa-solid fa-microphone-lines"/> Narration cue</button>
    {narrationJob?.status==='complete'&&<button type="button" onClick={importNarration} title="Add the narration from Narration Studio at the start"><i className="fa-solid fa-file-import"/> From Narration Studio</button>}
    <span className="vs-bar-spacer"/>
    <label className="vs-zoom"><i className="fa-solid fa-magnifying-glass-minus"/><input type="range" min="10" max="160" value={zoom} onChange={e=>setZoom(Number(e.target.value))} aria-label="Timeline zoom"/><i className="fa-solid fa-magnifying-glass-plus"/></label>
   </div>
   <div className="vs-tracks" ref={timelineRef}>
    <div className="vs-track-labels"><span/><span>Pictures</span><span>Narration</span></div>
    <div className="vs-track-scroll">
     <div style={{width:trackWidth,position:'relative'}}>
      <div className="vs-ruler" onPointerDown={e=>{const r=e.currentTarget.getBoundingClientRect();setPlaying(false);seek((e.clientX-r.left)/pxPerSec)}}>
       {Array.from({length:Math.ceil(trackWidth/pxPerSec)+1},(_,s)=>s%(pxPerSec<25?10:pxPerSec<60?5:1)===0&&<span key={s} style={{left:s*pxPerSec}}>{fmt(s).replace(/\.0$/,'')}</span>)}
      </div>
      <div className="vs-track vs-track-pictures" onPointerDown={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();seek((e.clientX-r.left)/pxPerSec);setSelected(null)}}}>
       {layout.map(({clip,start})=><button type="button" key={clip.id} className={'vs-clip '+clip.type+(selected?.id===clip.id?' selected':'')} style={{left:start*pxPerSec,width:clipLength(clip)*pxPerSec-2,...(clip.type==='image'?{backgroundImage:`url(/api/images/${clip.source_id})`}:clip.type==='color'?{background:clip.color}:{})}} onClick={()=>{setSelected({kind:'clip',id:clip.id});if(time<start||time>=start+clipLength(clip))seek(start)}} title={clip.name}>
        <span><i className={'fa-solid '+(clip.type==='video'?'fa-video':clip.type==='image'?'fa-image':'fa-square')}/> {clip.name}</span></button>)}
       {!clips.length&&<span className="vs-track-hint">Drop videos or images here</span>}
      </div>
      <div className="vs-track vs-track-cues" onDoubleClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();addCue((e.clientX-r.left)/pxPerSec)}}}>
       {cues.map(c=>{const pending=['queued','running'].includes(cueJobs[c.id]?.status),stale=c.audio&&!c.imported&&c.signature!==cueSignature(c),width=Math.max(60,(c.audio?cueLen(c):Math.max(2,c.text.split(/\s+/).length/2.6))*pxPerSec);
        const overlap=c.audio&&cues.some(o=>o.id!==c.id&&o.start>c.start&&o.start<cueEnd(c));
        return <div key={c.id} role="button" tabIndex={0} className={'vs-cue'+(c.audio?'':' draft')+(stale?' stale':'')+(overlap?' overlap':'')+(selected?.id===c.id?' selected':'')} style={{left:c.start*pxPerSec,width}}
         onKeyDown={e=>{if(e.key==='Enter')setSelected({kind:'cue',id:c.id})}}
         onPointerDown={e=>{e.preventDefault();setSelected({kind:'cue',id:c.id});const x0=e.clientX,s0=c.start;let moved=false;
          const move=ev=>{const dx=ev.clientX-x0;if(Math.abs(dx)>3)moved=true;if(moved)setCue(c.id,{start:Math.max(0,Math.round((s0+dx/pxPerSec)*10)/10)})};
          const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);if(!moved)seek(c.start)};
          window.addEventListener('pointermove',move);window.addEventListener('pointerup',up)}}>
         <span className="vs-cue-voice">{pending?<i className="fa-solid fa-spinner fa-spin"/>:<i className="fa-solid fa-microphone-lines"/>} {c.imported?'Narration Studio':voiceLabel(c.voice_key)||'No voice'}</span>
         <span className="vs-cue-text">{c.text||'Empty cue'}</span>
        </div>})}
       {!cues.length&&<span className="vs-track-hint">Move the playhead and click “Add narration here”, or double-click this track</span>}
      </div>
      <div className="vs-playhead" style={{left:time*pxPerSec}}/>
     </div>
    </div>
   </div>
  </div>
  </>}
  {cues.filter(c=>c.audio).map(c=><audio key={c.id+c.audio} ref={el=>{if(el)cueAudio.current[c.id]=el;else delete cueAudio.current[c.id]}} src={'/api/outputs/'+c.audio+'.wav'} preload="auto"/>)}
  {pickerFor&&<NarratorPicker api={api} options={voiceOptions} currentKey={cues.find(c=>c.id===pickerFor)?.voice_key||''} sectionNumber={cues.findIndex(c=>c.id===pickerFor)+1}
   usedKeys={[...new Set(cues.map(c=>c.voice_key).filter(Boolean))]} onSelect={key=>{setCue(pickerFor,{voice_key:key});setPickerFor(null)}} onClose={()=>setPickerFor(null)} onVoiceCreated={refreshVoices}/>}
 </div>;
}
