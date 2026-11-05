// Kokoro runs in a browser Web Worker: model weights and synthesis stay on the visitor's device.
// Compiled by Vite into a same-origin worker so Safari never needs to import an ESM
// package directly from a cross-origin CDN. Model weights load from Hugging Face.
import { KokoroTTS, env } from 'kokoro-js';
import { env as transformersEnv } from '@huggingface/transformers';

// kokoro-js exposes a wrapper env with top-level wasmPaths (unlike Transformers.js).
// Point at both matching, locally hosted ONNX runtime assets.
if(typeof self!=='undefined'&&self.location?.origin){
 const wasmRoot=new URL('/studio/wasm/',self.location.origin);
 env.wasmPaths={
  mjs:new URL('ort-wasm-simd-threaded.jsep.mjs',wasmRoot).href,
  wasm:new URL('ort-wasm-simd-threaded.jsep.wasm',wasmRoot).href
 };
 // Configure the actual Transformers.js downloader, not kokoro-js's
 // limited env wrapper. Transformers.js appends file names to this path,
 // so the template MUST end in a slash and MUST NOT contain {file}.
 // Model and tokenizer files stay on our origin.
 transformersEnv.remoteHost=new URL('/model/',self.location.origin).href;
 transformersEnv.remotePathTemplate='{model}/resolve/{revision}/';
 // Kokoro's voice .bin files are fetched on the first generate() call, not
 // during from_pretrained(). They use a hardcoded Hugging Face base URL and
 // are not controlled by Transformers.js remoteHost.
 const voiceOrigin='https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/';
 const voiceLocal=new URL('/model/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/',self.location.origin).href;
 const nativeFetch=self.fetch.bind(self);
 self.fetch=async (input,init)=>{
  const original=input instanceof Request?input.url:input instanceof URL?input.href:String(input);
  const redirected=original.startsWith(voiceOrigin)?voiceLocal+original.slice(voiceOrigin.length):null;
  const target=redirected||original;
  try{
   const response=await nativeFetch(redirected?(input instanceof Request?new Request(redirected,input):redirected):input,init);
   if(!response.ok && redirected){
    throw new Error('Voice asset '+new URL(target).pathname+' returned HTTP '+response.status);
   }
   return response;
  }catch(error){
   // Report the actual failing URL rather than the last *successful* model
   // download progress entry.
   lastFailedRequest=target;
   throw error;
  }
 };
}


const MODEL='onnx-community/Kokoro-82M-v1.0-ONNX';
let modelPromise=null;
let activeStage='startup';
let lastDownload='';
let lastFailedRequest='';
const MODEL_ROOT=new URL('/model/'+MODEL+'/resolve/main/',self.location.origin).href;
// A HEAD check does not download the ~92 MB ONNX model. It only diagnoses whether
// the model host or its redirects are accessible from this visitor's browser.
async function testResource(name){
 try{
  const r=await fetch(MODEL_ROOT+name,{method:'HEAD',cache:'no-store'});
  return name+': HTTP '+r.status+(r.ok?' (reachable)':' (proxy or upstream error)');
 }catch(error){return name+': network failure ('+(error?.message||String(error))+')'}
}
const post=(type,details={})=>self.postMessage({type,...details});
async function getModel(){
 if(!modelPromise){
  lastFailedRequest='';
  activeStage='download / model initialization';
  post('status',{message:'Downloading Kokoro model (first use can take a while)…'});
  modelPromise=KokoroTTS.from_pretrained(MODEL,{
   dtype:'q8', device:'wasm',
   progress_callback:p=>{
    if(p.file||p.name)lastDownload=String(p.file||p.name).split('/').slice(-2).join('/');
    if(p.status==='progress'&&Number.isFinite(p.progress))post('progress',{percent:Math.max(0,Math.min(100,Math.round(p.progress)))});
    else if(p.status==='done')post('status',{message:'Preparing Kokoro model…'});
   }
  }).catch(error=>{modelPromise=null;throw error});
 }
 return modelPromise;
}
function wav(samples,sampleRate){
 const out=new ArrayBuffer(44+samples.length*2),view=new DataView(out);
 const write=(at,s)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i))};
 write(0,'RIFF');view.setUint32(4,36+samples.length*2,true);write(8,'WAVE');
 write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);
 view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);
 view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);
 view.setUint16(34,16,true);write(36,'data');view.setUint32(40,samples.length*2,true);
 for(let i=0;i<samples.length;i++){
  const n=Math.max(-1,Math.min(1,samples[i]));
  view.setInt16(44+i*2,n<0?n*32768:n*32767,true);
 }
 return out;
}
self.addEventListener('message',async event=>{
 const {type,id,text,voice}=event.data||{};
 if(type!=='generate')return;
 if(typeof text!=='string'||text.trim().length===0||Array.from(text).length>500){
  post('error',{id,message:'Enter between 1 and 500 characters.'});return;
 }
 if(!/^(af|am|bf|bm)_[a-z]+$/.test(voice||'')){
  post('error',{id,message:'Choose a supported Kokoro voice.'});return;
 }
 try{
  const tts=await getModel();
  activeStage='audio generation';
  lastFailedRequest='';
  post('status',{id,message:'Generating speech on your device…'});
  const result=await tts.generate(text.trim(),{voice});
  const samples=result.audio;
  if(!samples||!samples.length)throw Error('Kokoro returned no audio.');
  const buffer=wav(samples,result.sampling_rate||24000);
  self.postMessage({type:'complete',id,buffer},[buffer]);
 }catch(err){
  const reason=err instanceof Error?err.message:String(err);
  let diagnostics='';
  if(activeStage==='download / model initialization'){
   post('status',{id,message:'Checking model download availability…'});
   const checks=await Promise.all([testResource('config.json'),testResource('onnx/model_quantized.onnx')]);
   diagnostics=' '+checks.join('; ')+'.';
  }
  const location=lastFailedRequest?' Failed request: '+lastFailedRequest+'.':lastDownload?' Last downloaded: '+lastDownload+'.':'';
  post('error',{id,message:'Voice engine '+activeStage+' failed: '+(reason||'Unknown error')+'.'+location+diagnostics+' If model requests succeed, inspect the local WebAssembly runtime or browser console.',stage:activeStage});
 }
});

post('worker-ready',{message:'Kokoro browser engine loaded.'});
