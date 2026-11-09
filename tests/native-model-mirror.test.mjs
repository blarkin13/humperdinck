import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {handleNativeModel,FILES} from '../src/native-model-mirror.js';

const base='https://humperdinck.studio/native-models/kokoro/';
function bucket(parts){
 return {async get(key){
  const data=parts[key.split('/').pop()];
  if(!data)return null;
  return {size:data.length,body:new Blob([data]).stream()};
 }};
}
test('unknown names and methods are refused',async()=>{
 assert.equal((await handleNativeModel(new Request(base+'../secret'),{MODEL_BUCKET:bucket({})})).status,404);
 assert.equal((await handleNativeModel(new Request(base+'x.onnx'),{MODEL_BUCKET:bucket({})})).status,404);
 assert.equal((await handleNativeModel(new Request(base+'voices-v1.0.bin',{method:'POST'}),{})).status,405);
 assert.equal((await handleNativeModel(new Request(base+'voices-v1.0.bin'),{})).status,503);
});
test('multi-part model streams as one file in order',async()=>{
 const original=FILES['kokoro-v1.0.onnx'];
 const saved={...original};
 const a=new Uint8Array([1,2,3]),b=new Uint8Array([4,5]);
 original.size=5;
 try{
  const r=await handleNativeModel(new Request(base+'kokoro-v1.0.onnx'),
   {MODEL_BUCKET:bucket({'kokoro-v1.0.onnx.part-aa':a,'kokoro-v1.0.onnx.part-ab':b})});
  assert.equal(r.status,200);
  assert.equal(r.headers.get('Content-Length'),'5');
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],[1,2,3,4,5]);
 }finally{Object.assign(original,saved)}
});
test('a missing or wrong-size part is a 503, never a truncated file',async()=>{
 const r=await handleNativeModel(new Request(base+'kokoro-v1.0.onnx'),
  {MODEL_BUCKET:bucket({'kokoro-v1.0.onnx.part-aa':new Uint8Array(3)})});
 assert.equal(r.status,503);
 const s=await handleNativeModel(new Request(base+'voices-v1.0.bin'),
  {MODEL_BUCKET:bucket({'voices-v1.0.bin':new Uint8Array(10)})});
 assert.equal(s.status,503);
});
