import React,{useEffect,useRef,useState} from 'react';

// Sample scripts with varied sounds and intonation, which gives the voice clone more to learn from.
const scripts=[
 'The old lighthouse keeper climbed the spiral stairs every evening. He never once missed a night, not in thirty years. Would anyone remember him when the light finally went dark? Perhaps. But the ships would, and that was enough.',
 'Good morning, and welcome back. Today we are exploring something remarkable: how a single idea can travel across oceans, change languages, and still arrive home sounding familiar. Let us begin.',
 'Honestly, I did not expect the package to arrive so quickly. I opened the door, and there it was, sitting on the step, slightly damp from the rain. Inside? Twelve jars of homemade strawberry jam.',
];
const MIN=8,IDEAL=20,MAX=60;
const pickType=()=>['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg'].find(t=>window.MediaRecorder?.isTypeSupported?.(t))||'';
const extFor=t=>t.includes('mp4')?'m4a':t.includes('ogg')?'ogg':'webm';

// Record a voice reference from the microphone, review it, then save it like an uploaded file.
export default function Recorder({onSave}){
 const [devices,setDevices]=useState([]),[device,setDevice]=useState(''),[state,setState]=useState('idle'),[seconds,setSeconds]=useState(0),[level,setLevel]=useState(0),[peak,setPeak]=useState(0),[clip,setClip]=useState(null),[name,setName]=useState('My voice'),[script,setScript]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const rec=useRef(null),stream=useRef(null),timer=useRef(null),raf=useRef(null),ctx=useRef(null);
 async function listDevices(){try{const all=await navigator.mediaDevices.enumerateDevices();setDevices(all.filter(d=>d.kind==='audioinput'))}catch{}}
 useEffect(()=>{listDevices();return()=>{cleanup();}},[]);
 useEffect(()=>()=>{if(clip)URL.revokeObjectURL(clip.url)},[clip]);
 function cleanup(){clearInterval(timer.current);cancelAnimationFrame(raf.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;ctx.current?.close().catch(()=>{});ctx.current=null}
 async function start(){
  setError('');setClip(null);setPeak(0);
  if(!navigator.mediaDevices?.getUserMedia){setError('Microphone capture is unavailable in this embedded window. Use Humperdinck → Open in Browser and record there, or upload an audio recording.');return}
  try{
   // Turn off the browser's voice processing: it changes the timbre the clone learns from.
   stream.current=await navigator.mediaDevices.getUserMedia({audio:{deviceId:device?{exact:device}:undefined,echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1}});
  }catch(e){setError(e.name==='NotAllowedError'?'Microphone access was blocked. Allow microphone access in your operating system privacy settings and for Humperdinck or the browser, then try again.':'Could not open the microphone: '+e.message);return}
  listDevices();
  ctx.current=new AudioContext();const analyser=ctx.current.createAnalyser();analyser.fftSize=1024;ctx.current.createMediaStreamSource(stream.current).connect(analyser);
  const data=new Float32Array(analyser.fftSize);
  const meter=()=>{analyser.getFloatTimeDomainData(data);let m=0;for(const v of data)m=Math.max(m,Math.abs(v));setLevel(m);setPeak(p=>Math.max(p,m));raf.current=requestAnimationFrame(meter)};meter();
  const type=pickType(),chunks=[];rec.current=new MediaRecorder(stream.current,type?{mimeType:type}:undefined);
  rec.current.ondataavailable=e=>e.data.size&&chunks.push(e.data);
  rec.current.onstop=()=>{const blob=new Blob(chunks,{type:rec.current.mimeType||type});setClip({blob,url:URL.createObjectURL(blob),ext:extFor(blob.type)});cleanup();setState('review')};
  rec.current.start(250);setSeconds(0);setState('recording');
  const t0=Date.now();timer.current=setInterval(()=>{const s=(Date.now()-t0)/1000;setSeconds(s);if(s>=MAX)stop()},200);
 }
 function stop(){if(rec.current?.state==='recording')rec.current.stop()}
 async function save(){setBusy(true);try{await onSave(new File([clip.blob],`${name.trim()||'My voice'}.${clip.ext}`,{type:clip.blob.type}));setClip(null);setState('idle')}finally{setBusy(false)}}
 const warn=state==='review'?(seconds<MIN?`That was only ${Math.round(seconds)} seconds. Aim for ${IDEAL}–30 seconds for a reliable clone.`:peak<0.08?'The recording is very quiet. Move closer to the microphone or raise its input level.':peak>0.98?'The recording clipped (too loud). Move back a little or lower the input level.':''):'';
 return <div className="recorder">
  <div className="field-row"><div className="field"><label>Voice name</label><input aria-label="Voice name" value={name} onChange={e=>setName(e.target.value)}/></div>
   <div className="field"><label>Microphone</label><select aria-label="Microphone" value={device} onChange={e=>setDevice(e.target.value)} disabled={state==='recording'}><option value="">System default</option>{devices.map((d,i)=><option key={d.deviceId||i} value={d.deviceId}>{d.label||'Microphone '+(i+1)}</option>)}</select></div></div>
  <label>Read this aloud <button className="link" onClick={()=>setScript((script+1)%scripts.length)} disabled={state==='recording'}>Different text</button></label>
  <div className="script-card">{scripts[script]}</div>
  <p className="hint">Use a quiet room, speak naturally at your normal distance from the mic, and record {IDEAL}–30 seconds. Only record voices you have permission to clone.</p>
  <div className="rec-row">
   {state==='recording'?<button className="danger rec-btn" onClick={stop}>■ Stop</button>:<button className="primary rec-btn" onClick={start}>● {clip?'Record again':'Start recording'}</button>}
   <div className="meter" aria-label="Input level"><div style={{width:Math.min(100,level*140)+'%',background:level>0.95?'#e0707a':level>0.08?'#35b7bd':'#5a7487'}}/></div>
   <span className={'rec-time'+(state==='recording'?' live':'')}>{seconds.toFixed(0)}s{state==='recording'&&seconds<MIN?` (min ${MIN}s)`:''}</span>
  </div>
  {error&&<div className="notice">{error}</div>}
  {clip&&state==='review'&&<div className="saved"><audio controls src={clip.url}/>{warn&&<p className="hint">⚠ {warn}</p>}
   <div className="actions tight"><button className="primary" disabled={busy||!name.trim()} onClick={save}>{busy?'Saving...':'Save voice'}</button><button disabled={busy} onClick={()=>{setClip(null);setState('idle');setSeconds(0)}}>Discard</button></div>
   <p className="hint">After saving you can trim, clean up and normalize the recording in the audio editor.</p></div>}
 </div>;
}
