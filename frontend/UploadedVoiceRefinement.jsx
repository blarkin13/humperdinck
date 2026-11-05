import React,{useEffect,useState} from 'react';
import {useNotifications} from './Notifications.jsx';

const DEFAULTS={pitch:50,pace:50,rasp:50,warmth:50};
const LABELS={
 pitch:['Pitch','Lower','Higher'],
 pace:['Pace','Slower','Faster'],
 rasp:['Texture / presence','Softer','More edge'],
 warmth:['Warmth','Brighter','Warmer'],
};
const SAMPLE='The old lighthouse stood quietly above the waves, waiting for the next storm.';
function normalized(data){return {sliders:{...DEFAULTS,...data?.sliders},description:data?.description||''}}
function same(a,b){return JSON.stringify(normalized(a))===JSON.stringify(normalized(b))}
export default function UploadedVoiceRefinement({voice,api,onSaved}){
 const {notify}=useNotifications();
 const [saved,setSaved]=useState(normalized(null)),[draft,setDraft]=useState(normalized(null));
 const [history,setHistory]=useState([]),[text,setText]=useState(SAMPLE);
 const [job,setJob]=useState(null),[working,setWorking]=useState(false),[loading,setLoading]=useState(false);
 const [previewSignature,setPreviewSignature]=useState('');
 const key=JSON.stringify([voice?.voice_id,draft,text]);
 useEffect(()=>{
  if(!voice?.voice_id)return;
  let cancelled=false;setLoading(true);setJob(null);
  api('voices/'+voice.voice_id+'/refinement').then(result=>{
   if(cancelled)return;
   setSaved(normalized(result.refinement));setDraft(normalized(result.refinement));
   setHistory(result.history||[]);
  }).catch(err=>{if(!cancelled)notify(err.message,'error')})
    .finally(()=>{if(!cancelled)setLoading(false)});
  return()=>{cancelled=true};
 },[voice?.voice_id]);
 useEffect(()=>{
  if(!job||!['queued','running'].includes(job.status))return;
  let stopped=false;
  const timer=setInterval(async()=>{
   try{
    const status=await api('jobs/'+job.job_id);
    if(stopped)return;
    setJob(status);
    if(status.status==='failed')notify(status.message||'Voice preview failed','error');
   }catch(err){if(!stopped){setJob(null);notify(err.message,'error')}}
  },1100);
  return()=>{stopped=true;clearInterval(timer)};
 },[job?.job_id,job?.status]);
 function setSlider(field,value){setDraft(old=>({...old,sliders:{...old.sliders,[field]:value}}))}
 async function save(){
  if(!voice?.voice_id)return;
  setWorking(true);
  try{
   const result=await api('voices/'+voice.voice_id+'/refinement',{
    method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft),
   });
   setSaved(normalized(result.refinement));setHistory(result.history||[]);
   notify('Voice refinements saved. The original recording is unchanged.','success');
   onSaved?.();
  }catch(err){notify(err.message,'error')}finally{setWorking(false)}
 }
 async function preview(){
  if(!text.trim())return;
  setWorking(true);setPreviewSignature(key);setJob(null);
  try{
   const result=await api('voices/'+voice.voice_id+'/refinement-preview',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...draft,text}),
   });
   setJob(result);
  }catch(err){notify(err.message,'error')}finally{setWorking(false)}
 }
 async function suggest(){
  if(!draft.description.trim())return;
  setWorking(true);
  try{
   const result=await api('voice-refinement/suggest',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(draft),
   });
   setDraft(old=>({...old,sliders:{...old.sliders,...result.sliders}}));
   notify('Suggested slider adjustments from your description. Review them before saving.','info');
  }catch(err){notify(err.message,'error')}finally{setWorking(false)}
 }
 async function restore(version){
  setWorking(true);
  try{
   const result=await api('voices/'+voice.voice_id+'/refinement/restore/'+version,{method:'POST'});
   setSaved(normalized(result.refinement));setDraft(normalized(result.refinement));
   setHistory(result.history||[]);setJob(null);
   notify('Restored voice settings from version '+version,'success');onSaved?.();
  }catch(err){notify(err.message,'error')}finally{setWorking(false)}
 }
 const dirty=!same(saved,draft);
 const processing=working||loading||['queued','running'].includes(job?.status);
 return <div className="uploaded-refinement">
  <div className="uploaded-refinement-head"><h3><i className="fa-solid fa-sliders" aria-hidden="true"/> Refine this uploaded voice</h3><span>Non-destructive</span></div>
  <p className="hint">These adjustments affect speech generated with this recording, not your original reference audio. Pitch and pace change playback characteristics; texture and warmth use subtle audio EQ rather than creating a different voice.</p>
  <div className="uploaded-refinement-sliders">{Object.entries(LABELS).map(([field,[label,low,high]])=><label key={field}>
   <span>{label}<strong>{draft.sliders[field]}</strong></span>
   <input type="range" min="0" max="100" step="1" value={draft.sliders[field]} disabled={loading} onChange={e=>setSlider(field,Number(e.target.value))}/>
   <small><span>{low}</span><span>{high}</span></small>
  </label>)}</div>
  <label className="uploaded-refinement-description">Voice direction notes (optional)
   <textarea className="short" maxLength={1200} value={draft.description} disabled={loading} onChange={e=>setDraft(old=>({...old,description:e.target.value}))} placeholder="For example: slightly deeper, slower, warm and smooth"/>
  </label>
  <div className="uploaded-refinement-tools">
   <button type="button" onClick={suggest} disabled={processing||!draft.description.trim()} title="Translate supported voice descriptions into suggested slider values"><i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true"/> Suggest settings</button>
   <button type="button" onClick={()=>setDraft(normalized(saved))} disabled={processing||!dirty} title="Revert unsaved changes">Reset edits</button>
  </div>
  <p className="hint">The current cloning model cannot reliably obey a free-form voice prompt while cloning. Notes are saved with your voice; Suggest settings interprets common words such as deeper, slower, warmer, or raspy into slider values. It does not retrain the voice.</p>
  <div className="uploaded-refinement-preview">
   <label>Test narration<textarea className="short" value={text} maxLength={600} onChange={e=>setText(e.target.value)} aria-label="Test text for the uploaded voice"/></label>
   <div className="uploaded-refinement-actions">
    <button type="button" className="voice-icon-action" onClick={preview} disabled={processing||!text.trim()} aria-label="Generate adjusted voice preview" title="Generate adjusted voice preview"><i className={'fa-solid '+(processing?'fa-spinner fa-spin':'fa-play')}/></button>
    <button type="button" className="primary voice-icon-action" onClick={save} disabled={processing||!dirty} aria-label="Save voice refinements" title="Save voice refinements"><i className="fa-solid fa-floppy-disk"/></button>
   </div>
   {job?.status==='complete'&&previewSignature===key&&<audio controls src={job.download_url} aria-label="Adjusted voice preview"/>}
   {job?.status==='complete'&&previewSignature!==key&&<p className="hint">Settings changed. Generate another preview to hear the updated voice.</p>}
   {['queued','running'].includes(job?.status)&&<small aria-live="polite">{job.message||'Generating preview…'}</small>}
  </div>
  {history.length>0&&<details className="uploaded-refinement-history"><summary>Saved adjustments · {history.length} {history.length===1?'version':'versions'}</summary><div>
   {[...history].reverse().map(item=><div className="uploaded-refinement-version" key={item.version}><span>Version {item.version} · {new Date(item.created_at).toLocaleDateString()}</span><button type="button" disabled={processing} onClick={()=>restore(item.version)}>Restore</button></div>)}
  </div></details>}
 </div>;
}
