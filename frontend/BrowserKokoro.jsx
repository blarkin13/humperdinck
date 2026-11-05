import React,{useEffect,useRef,useState} from 'react';
import './BrowserKokoro.css';

export const KOKORO_LIMIT=500;
const STARTER='Good evening. Welcome to Humperdinck. You can hear this voice in your own words.';
function countCharacters(value){return Array.from(value).length}
export default function BrowserKokoro({voices,voice,text='',sectionNumber=1,playRequest=null}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [progress,setProgress]=useState(null),[error,setError]=useState('');
 const [audioUrl,setAudioUrl]=useState(null);
 const worker=useRef(null),request=useRef(0),urlRef=useRef(null),mounted=useRef(true);
 const length=countCharacters(text),valid=length>0&&length<=KOKORO_LIMIT&&!!voice;
 useEffect(()=>{
  mounted.current=true;
  return()=>{
   mounted.current=false;
   worker.current?.terminate();
   worker.current=null;
   if(urlRef.current)URL.revokeObjectURL(urlRef.current);
  };
 },[]);
 function start(override=null){
  const spokenText=override?.text??text;
  const spokenVoice=override?.voice??voice;
  if(!spokenText.trim()||Array.from(spokenText).length>KOKORO_LIMIT||!spokenVoice||busy)return;
  setError('');setBusy(true);setMessage('Starting voice engine…');setProgress(null);
  if(urlRef.current){URL.revokeObjectURL(urlRef.current);urlRef.current=null;setAudioUrl(null)}
  if(!worker.current){
   try{
    const next=new Worker(new URL('./KokoroWorker.js',import.meta.url),{type:'module'});
    next.addEventListener('message',event=>{
     if(!mounted.current)return;
     const data=event.data||{};
     if(data.type==='worker-ready'){setMessage('Browser engine ready.');return}
     if(data.type==='progress'){setProgress(data.percent);return}
     if(data.type==='status'){setMessage(data.message||'Working…');return}
     if(data.id!==request.current)return;
     if(data.type==='complete'){
      const url=URL.createObjectURL(new Blob([data.buffer],{type:'audio/wav'}));
      urlRef.current=url;setAudioUrl(url);setMessage('Ready to play or download.');
      setProgress(null);setBusy(false);
     }else if(data.type==='error'){
      setError(data.message||'Generation failed.');setBusy(false);setProgress(null);
     }
    });
    next.addEventListener('error',event=>{
     if(!mounted.current)return;
     setError('Kokoro worker could not start ('+(event.message||'unknown browser error')+'). Try reloading the page, or use Chrome if Safari blocks model downloads.');
     setBusy(false);setProgress(null);
     next.terminate();worker.current=null;
    });
    worker.current=next;
   }catch(err){
    setError(err?.message||'This browser does not support audio generation.');
    setBusy(false);return;
   }
  }
  const id=++request.current;
  worker.current.postMessage({type:'generate',id,text:spokenText,voice:spokenVoice});
 }
 const playedRequest=useRef(null);
 useEffect(()=>{if(playRequest&&playRequest.id!==playedRequest.current){playedRequest.current=playRequest.id;start(playRequest)}},[playRequest?.id]);
 function restart(){
  worker.current?.terminate();worker.current=null;setBusy(false);
  setError('Engine reset. You can try again.');
 }
 return <div className="browser-kokoro" aria-label="Generate Kokoro voice audio in your browser">
  <div className="browser-kokoro-head"><div><strong><i className="fa-solid fa-wave-square" aria-hidden="true"/> Generate narration</strong><p>Choose a built-in voice and generate speech from your text directly in your browser.</p></div><span className="browser-kokoro-chip">BUILT-IN VOICE</span></div>
  <p className="hint">Selected: section {sectionNumber} · {voices.find(v=>v[0]===voice)?.[1]||'Choose a voice'} · {length} characters</p>
  <div className="browser-kokoro-controls"><small className={length>KOKORO_LIMIT?'warn':''}>{voice?'':'Choose a narrator above · '}{length} / {KOKORO_LIMIT} characters</small><button type="button" className="primary" disabled={!valid||busy} onClick={()=>start()}><i className={'fa-solid '+(busy?'fa-spinner fa-spin':'fa-play')} aria-hidden="true"/> {busy?'Generating…':'Generate speech'}</button>{busy&&<button type="button" onClick={restart}>Stop / reset</button>}</div>
  {busy&&<div className="browser-kokoro-progress" role="status"><span>{message}</span>{progress!==null&&<progress max="100" value={progress}/>}<small>First use downloads the Kokoro model. It may take time, memory, and CPU resources.</small></div>}
  {error&&<p className="warn" role="alert">{error}</p>}
  {audioUrl&&<div className="browser-kokoro-result"><strong>Generated voice</strong><audio controls src={audioUrl}/><a className="download" download={'humperdinck-kokoro-'+voice+'.wav'} href={audioUrl}><i className="fa-solid fa-download" aria-hidden="true"/> Download WAV</a></div>}
  <p className="browser-kokoro-footnote"><i className="fa-solid fa-circle-info" aria-hidden="true"/> Generate the selected section using its assigned speaker. Processing runs on your device; the browser limit is {KOKORO_LIMIT} characters per section.</p>
 </div>;
}
