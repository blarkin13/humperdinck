// Kokoro runs in a browser Web Worker: model weights and synthesis stay on the visitor's device.
// This module is only served by the public website and is not used by the desktop app.
// The pinned browser bundle is loaded from jsDelivr; model weights come from Hugging Face.
import { KokoroTTS } from 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';

const MODEL='onnx-community/Kokoro-82M-v1.0-ONNX';
let modelPromise=null;
const post=(type,details={})=>self.postMessage({type,...details});
async function getModel(){
 if(!modelPromise){
  post('status',{message:'Downloading Kokoro model (first use can take a while)…'});
  modelPromise=KokoroTTS.from_pretrained(MODEL,{
   dtype:'q8', device:'wasm',
   progress_callback:p=>{
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
  post('status',{id,message:'Generating speech on your device…'});
  const result=await tts.generate(text.trim(),{voice});
  const samples=result.audio;
  if(!samples||!samples.length)throw Error('Kokoro returned no audio.');
  const buffer=wav(samples,result.sampling_rate||24000);
  self.postMessage({type:'complete',id,buffer},[buffer]);
 }catch(err){
  post('error',{id,message:err?.message||'Kokoro could not generate audio in this browser.'});
 }
});
